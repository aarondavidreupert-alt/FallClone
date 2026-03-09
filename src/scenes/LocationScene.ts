/**
 * LocationScene.ts — Isometric map renderer + combat coordinator for Vault 13.
 *
 * Rendering pipeline
 * ──────────────────
 * Three tile layers per level: floor → objects → roof (Y-sorted via setDepth).
 *
 * Camera
 * ──────
 * Dual-camera setup: main camera (world / zoomable) + uiCam (HUD / fixed).
 * Pan: WASD / arrows  |  Zoom: +/- / wheel  |  Levels: [1][2][3]
 *
 * Combat mode  (Phase 7)
 * ─────────────────────
 * [C] enters combat.  CombatScene launches as a HUD overlay.
 * In combat:
 *   • Blue tile highlights show movement range (1 AP per tile).
 *   • Click floor tile → move (deducts AP from CombatSystem).
 *   • Click enemy dot → attack (uses equipped weapon's AP cost).
 *   • END TURN button in CombatScene → enemy AI acts, then player AP refills.
 *   • All enemies dead → victory, combat ends automatically.
 */

import Phaser from 'phaser';
import {
  MAP_W, MAP_H, HALF_H, TILE_W, TILE_H,
  T_EMPTY, T_FLOOR, T_FLOOR2, T_FLOOR3,
  OBJ_WALL, OBJ_DOOR,
  ROOF_STD,
  TX_FLOOR, TX_FLOOR2, TX_FLOOR3, TX_WALL, TX_DOOR, TX_ROOF,
} from '../utils/constants';
import { tileToWorld, tileDepth, mapWorldBounds, worldToTile } from '../systems/IsoRenderer';
import type { VaultMapData, LevelData, TileGrid } from '../data/vaultMap';
import type { CharacterData } from '../utils/types';
import { findPath } from '../systems/Pathfinder';
import { Player }    from '../entities/Player';
import { NPC, type NpcDef } from '../entities/NPC';
import { GroundItem, type GroundItemDef } from '../entities/GroundItem';
import { Enemy }     from '../entities/Enemy';
import { addItem }   from '../systems/InventorySystem';
import { CombatSystem } from '../systems/CombatSystem';
import { getEnemyDef }  from '../data/enemies';
import { getItem }      from '../data/items';
import { calcDerived }  from '../systems/StatsSystem';

// ── Camera constants ──────────────────────────────────────────────────────────
const PAN_SPEED = 420;
const ZOOM_STEP = 0.1;
const ZOOM_MIN  = 0.4;
const ZOOM_MAX  = 2.0;

// ── Tile → texture key lookups ────────────────────────────────────────────────
const FLOOR_TEX: Record<number, string> = {
  [T_FLOOR]:  TX_FLOOR,
  [T_FLOOR2]: TX_FLOOR2,
  [T_FLOOR3]: TX_FLOOR3,
};
const OBJ_TEX:  Record<number, string> = { [OBJ_WALL]: TX_WALL, [OBJ_DOOR]: TX_DOOR };
const ROOF_TEX: Record<number, string> = { [ROOF_STD]: TX_ROOF };

// ── NPC placements per level ──────────────────────────────────────────────────
const LEVEL_NPCS: Partial<Record<number, NpcDef[]>> = {
  0: [{ npcId: 'overseer', name: 'The Overseer', dialogueId: 'overseer', col: 37, row: 17 }],
};

// ── Enemy placements per level ────────────────────────────────────────────────
interface EnemySpawn { enemyId: string; col: number; row: number; }
const LEVEL_ENEMIES: Partial<Record<number, EnemySpawn[]>> = {
  0: [
    { enemyId: 'radscorpion', col: 25, row: 22 },
  ],
};

// ── Scene ─────────────────────────────────────────────────────────────────────

export class LocationScene extends Phaser.Scene {

  // ── World state ────────────────────────────────────────────────────────────
  private mapData!:    VaultMapData;
  private levelIndex = 0;
  private tiles:       Phaser.GameObjects.Image[] = [];
  private player!:     Player;
  private _npcs:        NPC[]        = [];
  private _groundItems: GroundItem[] = [];
  private _enemies:     Enemy[]      = [];

  // ── Combat state ───────────────────────────────────────────────────────────
  private _combatSystem:       CombatSystem | null = null;
  private _inCombat            = false;
  private _enemyTurnActive     = false;
  private _combatLog:          string[] = [];
  private _moveHighlights:     Phaser.GameObjects.Rectangle[] = [];
  private _pendingEnemyClick:  Enemy | null = null;

  // ── Input ──────────────────────────────────────────────────────────────────
  private cursors!:     Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key;
                   left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; };
  private keyLevel1!:    Phaser.Input.Keyboard.Key;
  private keyLevel2!:    Phaser.Input.Keyboard.Key;
  private keyLevel3!:    Phaser.Input.Keyboard.Key;
  private keyZoomIn!:    Phaser.Input.Keyboard.Key;
  private keyZoomOut!:   Phaser.Input.Keyboard.Key;
  private keyInventory!: Phaser.Input.Keyboard.Key;
  private keyC!:         Phaser.Input.Keyboard.Key;

  // ── HUD ────────────────────────────────────────────────────────────────────
  private hudLevel!: Phaser.GameObjects.Text;
  private hudCoord!: Phaser.GameObjects.Text;
  private hudTile!:  Phaser.GameObjects.Text;
  private hudChar!:  Phaser.GameObjects.Text;
  private _charData: CharacterData | null = null;

  // ── Cameras ────────────────────────────────────────────────────────────────
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  constructor() { super({ key: 'LocationScene' }); }

  // ────────────────────────────────────────────────────────────────────────────

  create(): void {
    this.mapData   = this.registry.get('mapData') as VaultMapData;
    this._charData = this.registry.get('characterData') as CharacterData | null ?? null;

    this._setupInput();
    this._setupUiCamera();
    this._renderLevel(0);
    this._spawnPlayer(0);
    this._buildHud();
    this._setupMouseWheel();
    this._setupClickMove();
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  private _setupUiCamera(): void {
    const { width, height } = this.scale;
    this.uiCam = this.cameras.add(0, 0, width, height, false, 'hud');
    this.uiCam.setZoom(1).setScroll(0, 0);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors   = kb.createCursorKeys();
    this.wasd = {
      up:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.keyLevel1    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyLevel2    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyLevel3    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyZoomIn    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
    this.keyZoomOut   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);
    this.keyInventory = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyC         = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);
  }

  private _setupMouseWheel(): void {
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam  = this.cameras.main;
      const zoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, ZOOM_MIN, ZOOM_MAX);
      cam.setZoom(zoom);
    });
  }

  // ── Player ────────────────────────────────────────────────────────────────

  private _spawnPlayer(levelIndex: number): void {
    if (this.player) this.player.destroy();
    const level = this.mapData.levels[levelIndex];
    this.player  = new Player(this, level.playerStart.col, level.playerStart.row);
    this.uiCam.ignore(this.player.sprite);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
  }

  // ── NPCs ──────────────────────────────────────────────────────────────────

  private _spawnNpcs(levelIndex: number): void {
    for (const def of LEVEL_NPCS[levelIndex] ?? []) {
      const npc = new NPC(this, def, (n) => this._openDialogue(n));
      this.uiCam.ignore(npc.sprite);
      this.uiCam.ignore(npc.label);
      this._npcs.push(npc);
    }
  }

  // ── Enemies ───────────────────────────────────────────────────────────────

  private _spawnEnemies(levelIndex: number): void {
    for (const e of this._enemies) e.destroy();
    this._enemies = [];

    for (const spawn of LEVEL_ENEMIES[levelIndex] ?? []) {
      const def = getEnemyDef(spawn.enemyId);
      if (!def) continue;
      const enemy = new Enemy(this, def, spawn.col, spawn.row,
        (e) => this._onEnemyClicked(e));
      enemy.excludeFromCamera(this.uiCam);
      this._enemies.push(enemy);
    }
  }

  private _onEnemyClicked(enemy: Enemy): void {
    // Set flag — scene's pointerdown fires next and reads it
    this._pendingEnemyClick = enemy;
  }

  // ── Ground items ──────────────────────────────────────────────────────────

  private _spawnGroundItems(level: LevelData): void {
    for (const spawn of level.items) {
      const def: GroundItemDef = {
        itemId: spawn.itemId, quantity: spawn.quantity,
        col: spawn.col,       row: spawn.row,
      };
      const gi = new GroundItem(this, def, (item) => this._pickupItem(item));
      this.uiCam.ignore(gi.dot);
      this.uiCam.ignore(gi.label);
      this._groundItems.push(gi);
    }
  }

  private _pickupItem(item: GroundItem): void {
    if (!this._charData) return;
    const result = addItem(this._charData, item.itemId, item.quantity);
    const idx    = this._groundItems.indexOf(item);
    if (idx !== -1) this._groundItems.splice(idx, 1);
    item.destroy();
    this._showToast(result.message, result.ok ? '#44ff44' : '#ff4444');
    this._updateHud();
  }

  private _spawnDroppedItem(itemId: string): void {
    const def: GroundItemDef = {
      itemId, quantity: 1,
      col: this.player.col, row: this.player.row + 1,
    };
    const gi = new GroundItem(this, def, (item) => this._pickupItem(item));
    this.uiCam.ignore(gi.dot);
    this.uiCam.ignore(gi.label);
    this._groundItems.push(gi);
  }

  // ── Click-to-move / combat click ──────────────────────────────────────────

  private _setupClickMove(): void {
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.scene.isActive('DialogueScene'))  return;
      if (this.scene.isActive('InventoryScene')) return;
      if (ptr.button !== 0) return;

      // Enemy was clicked — Phaser fired enemy event first; we set the flag.
      if (this._pendingEnemyClick) {
        const enemy = this._pendingEnemyClick;
        this._pendingEnemyClick = null;
        if (this._inCombat && !this._enemyTurnActive) this._combatAttack(enemy);
        return;
      }

      if (this.player.isMoving) return;

      const cam = this.cameras.main;
      const wp  = cam.getWorldPoint(ptr.x, ptr.y);
      const { col, row } = worldToTile(wp.x, wp.y);

      if (col < 0 || col >= MAP_W || row < 0 || row >= MAP_H) return;

      const level = this.mapData.levels[this.levelIndex];
      if (level.object[row][col] === OBJ_WALL) return;

      if (this._inCombat && !this._enemyTurnActive) {
        this._combatMove(col, row);
      } else if (!this._inCombat) {
        const path = findPath(level.object, this.player.col, this.player.row, col, row);
        this.player.walkPath(path);
      }
    });
  }

  // ── Map rendering ─────────────────────────────────────────────────────────

  private _renderLevel(index: number): void {
    for (const img of this.tiles)       img.destroy();
    for (const npc of this._npcs)       npc.destroy();
    for (const gi  of this._groundItems) gi.destroy();
    this.tiles = []; this._npcs = []; this._groundItems = [];

    this.levelIndex = index;
    const level     = this.mapData.levels[index];

    this._renderLayer(level, 0);
    this._renderLayer(level, 1);
    this._renderLayer(level, 2);
    this._spawnNpcs(index);
    this._spawnEnemies(index);
    this._spawnGroundItems(level);

    const bounds = mapWorldBounds();
    const cam    = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    const start = tileToWorld(level.playerStart.col, level.playerStart.row);
    cam.centerOn(start.x, start.y);
  }

  private _renderLayer(level: LevelData, layer: 0 | 1 | 2): void {
    const isRoof = layer === 2;
    for (let row = 0; row < MAP_H; row++) {
      for (let col = 0; col < MAP_W; col++) {
        let tileType: number;
        let texKey:   string | undefined;

        if      (layer === 0) { tileType = level.floor[row][col];  texKey = FLOOR_TEX[tileType]; }
        else if (layer === 1) { tileType = level.object[row][col]; texKey = OBJ_TEX[tileType];   }
        else                  { tileType = level.roof[row][col];   texKey = ROOF_TEX[tileType];  }

        if (!texKey || tileType === T_EMPTY) continue;

        const pos   = tileToWorld(col, row);
        const depth = tileDepth(col, row, layer);
        const img   = this.add.image(pos.x, pos.y, texKey)
          .setOrigin(0.5, 0).setDepth(depth);
        if (isRoof) img.setAlpha(0.55);
        this.uiCam.ignore(img);
        this.tiles.push(img);
      }
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private _buildHud(): void {
    const style = {
      fontFamily: 'monospace', fontSize: '12px', color: '#c8a000',
      backgroundColor: '#00000099', padding: { x: 6, y: 4 },
    };
    const { width, height } = this.scale;

    this.hudLevel = this.add.text(10, 10, '', style).setDepth(200_000);
    this.hudCoord = this.add.text(width - 10, 10, '', { ...style, align: 'right' })
      .setOrigin(1, 0).setDepth(200_000);
    this.hudTile  = this.add.text(10, height - 10, '', style)
      .setOrigin(0, 1).setDepth(200_000);
    this.hudChar  = this.add.text(width - 10, height - 10, '', { ...style, align: 'right' })
      .setOrigin(1, 1).setDepth(200_000);

    const hint = this.add.text(width / 2, height - 10,
      'WASD pan  |  [1][2][3] levels  |  +/- / wheel zoom  |  click to move  |  [I] inv  |  [C] combat',
      { ...style, color: '#607030' },
    ).setOrigin(0.5, 1).setDepth(200_000);

    this.cameras.main.ignore([this.hudLevel, this.hudCoord, this.hudTile, this.hudChar, hint]);
    this._updateHud();
  }

  private _updateHud(): void {
    const level = this.mapData.levels[this.levelIndex];
    const cam   = this.cameras.main;

    this.hudLevel.setText(`${this.mapData.name}  —  ${level.name}`);
    this.hudCoord.setText(`zoom ×${cam.zoom.toFixed(2)}  (${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)})`);

    const ptr = this.input.activePointer;
    const wp  = cam.getWorldPoint(ptr.x, ptr.y);
    const { col, row } = worldToTile(wp.x, wp.y);
    const inMap = col >= 0 && col < MAP_W && row >= 0 && row < MAP_H;
    this.hudTile.setText(inMap
      ? `(${col},${row})  f:${level.floor[row][col]} o:${level.object[row][col]}`
      : `(${col},${row})  —`);

    if (this._charData) {
      const c = this._charData;
      this.hudChar.setText(`${c.name}  LV${c.level}\nHP ${c.hp}/${c.max_hp}`);
    }
  }

  // ── Toast helpers ─────────────────────────────────────────────────────────

  private _showToast(message: string, color = '#c8e8c8', offsetY = 60): void {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height - offsetY, message, {
      fontFamily: 'monospace', fontSize: '12px', color,
      backgroundColor: '#00000099', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(200_002).setAlpha(0);
    this.cameras.main.ignore(toast);
    this.tweens.add({
      targets: toast, alpha: { from: 0, to: 1 },
      duration: 150, yoyo: true, hold: 1200,
      onComplete: () => toast.destroy(),
    });
  }

  // Alias kept for compatibility with existing calls
  private _showPickupToast(message: string, ok: boolean): void {
    this._showToast(message, ok ? '#44ff44' : '#ff4444');
  }

  // ── Dialogue ──────────────────────────────────────────────────────────────

  private _openDialogue(npc: NPC): void {
    if (this.scene.isActive('DialogueScene')) return;
    this.scene.launch('DialogueScene', { npcId: npc.dialogueId, npcName: npc.name });
  }

  // ── Level flash banner ────────────────────────────────────────────────────

  private _flashLevelBanner(text: string): void {
    const banner = this.add.text(
      this.scale.width / 2, this.scale.height / 2 - 40, text,
      { fontFamily: 'monospace', fontSize: '22px', color: '#c8a000',
        backgroundColor: '#00000099', padding: { x: 18, y: 10 } },
    ).setOrigin(0.5).setDepth(200_001).setAlpha(0);
    this.cameras.main.ignore(banner);
    this.tweens.add({
      targets: banner, alpha: { from: 0, to: 1 },
      duration: 180, yoyo: true, hold: 900,
      onComplete: () => banner.destroy(),
    });
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this._handlePan(delta);
    this._handleLevelSwitch();
    this._handleZoom();
    this._handleInventoryKey();
    this._handleCombatKey();
    this._handlePendingDrop();
    this._updateHud();
  }

  private _handleInventoryKey(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keyInventory)) return;
    if (this.scene.isActive('InventoryScene')) {
      this.scene.stop('InventoryScene');
    } else if (!this.scene.isActive('DialogueScene')) {
      this.scene.launch('InventoryScene');
    }
  }

  private _handleCombatKey(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keyC)) return;
    if (this._inCombat) {
      this._exitCombat('Fled from combat.');
    } else {
      const liveEnemies = this._enemies.filter(e => !e.isDead);
      if (liveEnemies.length > 0) this._enterCombat();
    }
  }

  private _handlePendingDrop(): void {
    const drop = this.registry.get('pendingDrop') as { itemId: string } | null;
    if (!drop) return;
    this.registry.set('pendingDrop', null);
    this._spawnDroppedItem(drop.itemId);
    this._showPickupToast(`Dropped ${drop.itemId}.`, true);
  }

  private _handlePan(delta: number): void {
    const cam   = this.cameras.main;
    const speed = PAN_SPEED / cam.zoom;
    const dt    = delta / 1000;
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  cam.scrollX -= speed * dt;
    if (this.cursors.right.isDown || this.wasd.right.isDown) cam.scrollX += speed * dt;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    cam.scrollY -= speed * dt;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  cam.scrollY += speed * dt;
  }

  private _handleLevelSwitch(): void {
    if (this._inCombat) return; // no level switching during combat
    const target =
      Phaser.Input.Keyboard.JustDown(this.keyLevel1) ? 0 :
      Phaser.Input.Keyboard.JustDown(this.keyLevel2) ? 1 :
      Phaser.Input.Keyboard.JustDown(this.keyLevel3) ? 2 : -1;
    if (target === -1 || target === this.levelIndex) return;
    if (target >= this.mapData.levels.length) return;
    this._renderLevel(target);
    this._spawnPlayer(target);
    this._flashLevelBanner(this.mapData.levels[target].name);
  }

  private _handleZoom(): void {
    const cam = this.cameras.main;
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomIn))
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomOut))
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
  }

  // ── Combat — entry / exit ─────────────────────────────────────────────────

  private _enterCombat(): void {
    if (!this._charData) return;

    this._combatSystem = new CombatSystem();
    this._combatSystem.startCombat(this._charData.max_ap);
    this._inCombat       = true;
    this._enemyTurnActive = false;
    this._combatLog      = [];

    this._pushCombatLog('Combat started!');
    this._pushCombatLog('--- Your turn ---');
    this._drawMoveHighlights();
    this._updateCombatState(false);

    this.scene.launch('CombatScene');

    // Listen for CombatScene button events
    this.game.events.once('combat:endTurn', this._onEndTurn, this);
    this.game.events.on('combat:flee',     this._onFlee,    this);
  }

  private _exitCombat(reason = 'Combat ended.'): void {
    if (!this._inCombat) return;

    this._inCombat        = false;
    this._enemyTurnActive = false;
    this._combatSystem?.endCombat();
    this._combatSystem = null;
    this._clearHighlights();

    this.game.events.off('combat:endTurn', this._onEndTurn, this);
    this.game.events.off('combat:flee',    this._onFlee,    this);

    this.scene.stop('CombatScene');
    this._showToast(reason, '#ffcc44', 220);
  }

  private _onEndTurn(): void {
    if (!this._inCombat) return;
    this._clearHighlights();
    this._updateCombatState(true);
    this._pushCombatLog('--- Enemy turn ---');
    this._updateCombatState(true);

    // Brief pause, then run enemy AI
    this.time.delayedCall(500, () => {
      const alive = this._enemies.filter(e => !e.isDead);
      this._runEnemyTurns(alive, 0);
    });
  }

  private _onFlee(): void {
    this._exitCombat('Fled from combat!');
  }

  // ── Combat — player actions ────────────────────────────────────────────────

  private _combatMove(col: number, row: number): void {
    if (!this._combatSystem) return;

    const level = this.mapData.levels[this.levelIndex];
    const path  = findPath(level.object, this.player.col, this.player.row, col, row);
    if (path.length === 0) return;

    const apCost = path.length; // 1 AP per tile
    if (!this._combatSystem.consumePlayerAP(apCost)) {
      this._pushCombatLog('Not enough AP to move there.');
      this._updateCombatState(false);
      return;
    }

    this.player.walkPath(path);
    this._clearHighlights();
    // Re-draw highlights after movement completes (~130ms per tile)
    this.time.delayedCall(path.length * 130 + 60, () => this._drawMoveHighlights());
    this._updateCombatState(false);
  }

  private _combatAttack(enemy: Enemy): void {
    if (!this._combatSystem || !this._charData || enemy.isDead) return;

    // Chebyshev distance
    const dx    = Math.abs(enemy.col - this.player.col);
    const dy    = Math.abs(enemy.row - this.player.row);
    const range = Math.max(dx, dy);

    // Weapon / skill lookup
    const weaponId  = this._charData.equipped.weapon;
    const weapDef   = weaponId ? getItem(weaponId) : null;

    const dmgMin    = weapDef?.dmgMin  ?? 1;
    const dmgMax    = weapDef?.dmgMax  ?? Math.max(1, this._charData.special.strength - 4);
    const apCost    = weapDef?.apCost  ?? 3;
    const weapRange = weapDef?.range   ?? 1;
    const skillName = weapDef?.skill   ?? 'unarmed';
    const skillVal  = (this._charData.skills[skillName] ?? 20) as number;
    const critChance = this._charData.special.luck;

    if (range > weapRange) {
      this._pushCombatLog(`Out of range! (${range} > ${weapRange} tiles)`);
      this._updateCombatState(false);
      return;
    }

    const result = this._combatSystem.playerAttack({
      skillValue: skillVal, dmgMin, dmgMax, apCost, weaponRange: weapRange,
      targetAC:   enemy.def.ac,
      targetDR:   enemy.def.dr,
      targetDT:   enemy.def.dt,
      range, critChance,
    });

    this._pushCombatLog(result.message);

    if (result.hit) {
      this._spawnFloatingDamage(enemy.sprite.x, enemy.sprite.y, result.damage.toString(), '#ffff44');
      enemy.takeDamage(result.damage);

      if (enemy.hp <= 0) {
        this._pushCombatLog(`${enemy.def.name} is dead!  +${enemy.def.xp} XP`);
        enemy.die();
        this._awardXP(enemy.def.xp);
        this.time.delayedCall(700, () => this._checkCombatEnd());
      }
    }

    this._updateCombatState(false);

    // Re-listen for end turn (once fires only once)
    if (this._inCombat) {
      this.game.events.off('combat:endTurn', this._onEndTurn, this);
      this.game.events.once('combat:endTurn', this._onEndTurn, this);
    }
  }

  // ── Combat — enemy AI ─────────────────────────────────────────────────────

  private _runEnemyTurns(enemies: Enemy[], index: number): void {
    if (!this._inCombat) return;

    if (index >= enemies.length) {
      // All enemies done — restore player turn
      this._combatSystem?.refillPlayerAP();
      this._pushCombatLog('--- Your turn ---');
      this._drawMoveHighlights();
      this._updateCombatState(false);
      // Re-listen for next end-turn click
      this.game.events.off('combat:endTurn', this._onEndTurn, this);
      this.game.events.once('combat:endTurn', this._onEndTurn, this);
      return;
    }

    const enemy = enemies[index];
    if (enemy.isDead) {
      this._runEnemyTurns(enemies, index + 1);
      return;
    }

    enemy.restoreAP();
    this._enemyActSingle(enemy, () => {
      this.time.delayedCall(350, () => this._runEnemyTurns(enemies, index + 1));
    });
  }

  private _enemyActSingle(enemy: Enemy, done: () => void): void {
    if (enemy.isDead || !this._charData) { done(); return; }

    const dx    = Math.abs(enemy.col - this.player.col);
    const dy    = Math.abs(enemy.row - this.player.row);
    const range = Math.max(dx, dy);

    // Attack if in range
    if (range <= enemy.def.attackRange && enemy.ap >= enemy.def.attackAPCost) {
      enemy.consumeAP(enemy.def.attackAPCost);
      this._enemyAttackPlayer(enemy, done);
      return;
    }

    // Move toward player, stop one tile short
    const level = this.mapData.levels[this.levelIndex];
    const path  = findPath(level.object, enemy.col, enemy.row, this.player.col, this.player.row);

    if (path.length >= 2 && enemy.ap >= enemy.def.moveAPCost) {
      const adjPath  = path.slice(0, path.length - 1); // stop adjacent
      const maxSteps = Math.floor(enemy.ap / enemy.def.moveAPCost);
      const steps    = Math.min(maxSteps, adjPath.length);

      if (steps > 0) {
        const newPos = adjPath[steps - 1];
        enemy.consumeAP(steps * enemy.def.moveAPCost);
        this._pushCombatLog(`${enemy.def.name} moves.`);
        this._updateCombatState(true);

        enemy.moveTo(newPos.col, newPos.row, () => {
          // After move: attack if now in range
          const dx2 = Math.abs(enemy.col - this.player.col);
          const dy2 = Math.abs(enemy.row - this.player.row);
          if (Math.max(dx2, dy2) <= enemy.def.attackRange && enemy.ap >= enemy.def.attackAPCost) {
            enemy.consumeAP(enemy.def.attackAPCost);
            this.time.delayedCall(200, () => this._enemyAttackPlayer(enemy, done));
          } else {
            done();
          }
        });
        return;
      }
    }

    done(); // can't act
  }

  private _enemyAttackPlayer(enemy: Enemy, done: () => void): void {
    if (!this._charData) { done(); return; }

    const playerAC = calcDerived(this._charData.special).ac;
    const armorId  = this._charData.equipped.armor;
    const playerDR = armorId ? (getItem(armorId)?.dr ?? 0) : 0;

    const result = this._combatSystem!.enemyAttack({
      skill:     enemy.def.attackSkill,
      dmgMin:    enemy.def.dmgMin,
      dmgMax:    enemy.def.dmgMax,
      range:     1,
      range_max: enemy.def.attackRange,
      targetAC:  playerAC,
      targetDR:  playerDR,
    });

    this._pushCombatLog(`${enemy.def.name} ${result.message}`);

    if (result.hit) {
      this._spawnFloatingDamage(
        this.player.sprite.x, this.player.sprite.y - 10,
        result.damage.toString(), '#ff4444',
      );
      this._charData.hp = Math.max(0, this._charData.hp - result.damage);

      if (this._charData.hp <= 0) {
        this._pushCombatLog('You have died!');
        this._updateCombatState(true);
        this._flashLevelBanner('  YOU DIED  ');
        this.time.delayedCall(2000, () => this._exitCombat('You have died.'));
        done();
        return;
      }
    }

    this._updateCombatState(true);
    done();
  }

  // ── Combat — end check & XP ───────────────────────────────────────────────

  private _checkCombatEnd(): void {
    if (!this._inCombat) return;
    const alive = this._enemies.filter(e => !e.isDead);
    if (alive.length === 0) {
      this._pushCombatLog('All enemies defeated!');
      this._flashLevelBanner('  VICTORY!  ');
      this._exitCombat('Victory! All enemies slain.');
    }
  }

  private _awardXP(amount: number): void {
    if (!this._charData) return;
    this._charData.xp += amount;
    this._showToast(`+${amount} XP`, '#aaffaa', 230);

    // Simple level-up check (every 1000 XP)
    const newLevel = Math.floor(this._charData.xp / 1000) + 1;
    if (newLevel > this._charData.level) {
      this._charData.level = newLevel;
      this._charData.max_hp += 4;
      this._charData.hp     += 4;
      this._flashLevelBanner(`  LEVEL UP!  LV ${newLevel}  `);
    }
  }

  // ── Combat — highlights ────────────────────────────────────────────────────

  private _drawMoveHighlights(): void {
    this._clearHighlights();
    if (!this._combatSystem || !this._inCombat) return;

    const ap    = this._combatSystem.playerAP;
    const level = this.mapData.levels[this.levelIndex];
    const tiles = this._reachableTiles(level.object, this.player.col, this.player.row, ap);

    for (const { col, row } of tiles) {
      const pos   = tileToWorld(col, row);
      const rect  = this.add.rectangle(
        pos.x, pos.y + HALF_H, TILE_W * 0.85, TILE_H * 0.85, 0x0055ff, 0.22,
      ).setDepth(tileDepth(col, row, 0) + 2);
      this.uiCam.ignore(rect);
      this._moveHighlights.push(rect);
    }
  }

  private _clearHighlights(): void {
    for (const r of this._moveHighlights) r.destroy();
    this._moveHighlights = [];
  }

  /** BFS — tiles reachable within `maxAP` steps (walls block). */
  private _reachableTiles(
    grid: TileGrid, startCol: number, startRow: number, maxAP: number,
  ): { col: number; row: number }[] {
    const visited = new Set<string>();
    const queue: { col: number; row: number; ap: number }[] = [
      { col: startCol, row: startRow, ap: maxAP },
    ];
    const result: { col: number; row: number }[] = [];

    while (queue.length > 0) {
      const { col, row, ap } = queue.shift()!;
      const key = `${col},${row}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (col !== startCol || row !== startRow) result.push({ col, row });
      if (ap <= 0) continue;

      for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nc = col + dc; const nr = row + dr;
        if (nc < 0 || nc >= MAP_W || nr < 0 || nr >= MAP_H) continue;
        if (grid[nr][nc] === OBJ_WALL) continue;
        const nk = `${nc},${nr}`;
        if (!visited.has(nk)) queue.push({ col: nc, row: nr, ap: ap - 1 });
      }
    }
    return result;
  }

  // ── Combat — log & state ──────────────────────────────────────────────────

  private _pushCombatLog(msg: string): void {
    this._combatLog.push(msg);
    if (this._combatLog.length > 20) this._combatLog.shift();
  }

  private _updateCombatState(enemyTurn: boolean): void {
    this._enemyTurnActive = enemyTurn;
    this.registry.set('combatState', {
      playerAP:    this._combatSystem?.playerAP    ?? 0,
      playerMaxAP: this._combatSystem?.playerMaxAP ?? 0,
      log:         [...this._combatLog],
      enemyTurn,
    });
    this.game.events.emit('combat:update');
  }

  // ── Floating damage numbers ───────────────────────────────────────────────

  private _spawnFloatingDamage(
    wx: number, wy: number, text: string, color = '#ffff44',
  ): void {
    const dmgText = this.add.text(wx, wy, text, {
      fontFamily: 'monospace', fontSize: '16px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(200_005);
    this.uiCam.ignore(dmgText);

    this.tweens.add({
      targets: dmgText,
      y:       wy - 40,
      alpha:   { from: 1, to: 0 },
      duration: 900,
      ease:    'Power2',
      onComplete: () => dmgText.destroy(),
    });
  }
}
