/**
 * LocationScene.ts — Isometric map renderer for Vault 13.
 *
 * Rendering pipeline
 * ──────────────────
 * For the active level, three tile layers are drawn in order:
 *
 *   Layer 0  floor   — flat isometric diamond tiles (grey / green / metal)
 *   Layer 1  objects — wall boxes and door sills (Y-sorted via setDepth)
 *   Layer 2  roof    — ceiling tiles (α = 0.55, always topmost)
 *
 * Depth / painter's algorithm
 * ────────────────────────────
 * Each sprite's depth = (col + row) × DEPTH_STEP + layer offset.
 * Tiles with larger (col + row) are closer to the camera and render on top.
 * The roof layer uses a base of DEPTH_ROOF (100 000) so it is always above
 * all world geometry regardless of position.
 *
 * Camera
 * ──────
 * Phaser's built-in camera is used.  It starts centred on the current level's
 * playerStart tile and is clamped to the world bounds via setBounds().
 * Pan:      WASD / arrow keys (hold = smooth scroll)
 * Zoom:     +/- keys or mouse-wheel
 * Level:    [1] [2] [3] to switch between vault levels
 *
 * Coordinate display
 * ──────────────────
 * A fixed HUD (camera-independent) shows the current level name,
 * camera position and the tile under the mouse pointer.
 *
 * Architecture note
 * ─────────────────
 * All tile Image objects for the current level are held in this.tiles[].
 * Switching levels destroys them and re-renders the new level.
 * When real assets arrive (post Phase 1 pipeline), the vaultMap data source
 * swaps to assets/maps/*.json without any change to this renderer.
 */

import Phaser from 'phaser';
import {
  MAP_W, MAP_H,
  T_EMPTY, T_FLOOR, T_FLOOR2, T_FLOOR3,
  OBJ_WALL, OBJ_DOOR,
  ROOF_STD,
  TX_FLOOR, TX_FLOOR2, TX_FLOOR3, TX_WALL, TX_DOOR, TX_ROOF,
} from '../utils/constants';
import { tileToWorld, tileDepth, mapWorldBounds, worldToTile } from '../systems/IsoRenderer';
import type { VaultMapData, LevelData } from '../data/vaultMap';
import type { CharacterData } from '../utils/types';
import { findPath } from '../systems/Pathfinder';
import { Player } from '../entities/Player';
import { NPC, type NpcDef } from '../entities/NPC';
import { GroundItem, type GroundItemDef } from '../entities/GroundItem';
import { addItem } from '../systems/InventorySystem';

// ── Camera pan speed (world pixels per second) ────────────────────────────────
const PAN_SPEED  = 420;
const ZOOM_STEP  = 0.1;
const ZOOM_MIN   = 0.4;
const ZOOM_MAX   = 2.0;

// ── Tile → texture key lookup ─────────────────────────────────────────────────
const FLOOR_TEX: Record<number, string> = {
  [T_FLOOR]:  TX_FLOOR,
  [T_FLOOR2]: TX_FLOOR2,
  [T_FLOOR3]: TX_FLOOR3,
};

const OBJ_TEX: Record<number, string> = {
  [OBJ_WALL]: TX_WALL,
  [OBJ_DOOR]: TX_DOOR,
};

const ROOF_TEX: Record<number, string> = {
  [ROOF_STD]: TX_ROOF,
};

// ── NPC placement data per level ──────────────────────────────────────────────
// Keyed by levelIndex.  Add more NPCs here as the game grows.
const LEVEL_NPCS: Partial<Record<number, NpcDef[]>> = {
  0: [
    {
      npcId:      'overseer',
      name:       'The Overseer',
      dialogueId: 'overseer',
      col:        37,
      row:        17,
    },
  ],
};

export class LocationScene extends Phaser.Scene {
  // ── State ─────────────────────────────────────────────────────────────────
  private mapData!:    VaultMapData;
  private levelIndex = 0;
  private tiles:       Phaser.GameObjects.Image[] = [];
  private player!:     Player;
  private _npcs:        NPC[] = [];
  private _groundItems: GroundItem[] = [];

  // ── Input ─────────────────────────────────────────────────────────────────
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up:    Phaser.Input.Keyboard.Key;
    down:  Phaser.Input.Keyboard.Key;
    left:  Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private keyLevel1!:   Phaser.Input.Keyboard.Key;
  private keyLevel2!:   Phaser.Input.Keyboard.Key;
  private keyLevel3!:   Phaser.Input.Keyboard.Key;
  private keyZoomIn!:   Phaser.Input.Keyboard.Key;
  private keyZoomOut!:  Phaser.Input.Keyboard.Key;
  private keyInventory!: Phaser.Input.Keyboard.Key;

  // ── HUD ───────────────────────────────────────────────────────────────────
  private hudLevel!:  Phaser.GameObjects.Text;
  private hudCoord!:  Phaser.GameObjects.Text;
  private hudTile!:   Phaser.GameObjects.Text;
  private hudChar!:   Phaser.GameObjects.Text;  // character name + HP/AP panel
  private _charData:  CharacterData | null = null;

  // ── Cameras ───────────────────────────────────────────────────────────────
  // uiCam is a permanent overlay camera: zoom=1, scroll=(0,0) forever.
  // It renders only HUD objects; all world tiles are excluded from it.
  // The main camera renders only world tiles; all HUD objects are excluded.
  // This means HUD elements are never affected by main-camera zoom changes.
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  constructor() {
    super({ key: 'LocationScene' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  create(): void {
    this.mapData   = this.registry.get('mapData') as VaultMapData;
    this._charData = this.registry.get('characterData') as CharacterData | null ?? null;

    this._setupInput();
    this._setupUiCamera();   // must be created before any tiles or HUD objects
    this._renderLevel(0);
    this._spawnPlayer(0);
    this._buildHud();
    this._setupMouseWheel();
    this._setupClickMove();
  }

  // ── Camera setup ──────────────────────────────────────────────────────────

  private _setupUiCamera(): void {
    const { width, height } = this.scale;
    // Add a second camera that covers the full viewport.
    // makeMain=false keeps cameras.main pointing at the world camera.
    this.uiCam = this.cameras.add(0, 0, width, height, false, 'hud');
    // Lock zoom and scroll permanently — HUD world-coords equal screen-coords.
    this.uiCam.setZoom(1);
    this.uiCam.setScroll(0, 0);
  }

  // ── Input setup ───────────────────────────────────────────────────────────

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
  }

  private _setupMouseWheel(): void {
    this.input.on('wheel', (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
      const cam  = this.cameras.main;
      const zoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, ZOOM_MIN, ZOOM_MAX);
      cam.setZoom(zoom);
    });
  }

  // ── Player ────────────────────────────────────────────────────────────────

  private _spawnPlayer(levelIndex: number): void {
    if (this.player) this.player.destroy();

    const level = this.mapData.levels[levelIndex];
    this.player = new Player(this, level.playerStart.col, level.playerStart.row);

    // Exclude player sprite from uiCam (same as world tiles).
    this.uiCam.ignore(this.player.sprite);

    // Camera follows the player sprite.
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
  }

  // ── NPCs ──────────────────────────────────────────────────────────────────

  private _spawnNpcs(levelIndex: number): void {
    const defs = LEVEL_NPCS[levelIndex] ?? [];
    for (const def of defs) {
      const npc = new NPC(this, def, (n) => this._openDialogue(n));
      // Exclude NPC sprite and label from the static uiCam so they pan/zoom
      // with the world camera, matching tiles and the player sprite.
      this.uiCam.ignore(npc.sprite);
      this.uiCam.ignore(npc.label);
      this._npcs.push(npc);
    }
  }

  // ── Ground items ──────────────────────────────────────────────────────────

  private _spawnGroundItems(level: LevelData): void {
    for (const spawn of level.items) {
      const def: GroundItemDef = {
        itemId:   spawn.itemId,
        quantity: spawn.quantity,
        col:      spawn.col,
        row:      spawn.row,
      };
      const gi = new GroundItem(this, def, (item) => this._pickupItem(item));
      // Exclude from uiCam so they pan/zoom with the world
      this.uiCam.ignore(gi.dot);
      this.uiCam.ignore(gi.label);
      this._groundItems.push(gi);
    }
  }

  private _pickupItem(item: GroundItem): void {
    if (!this._charData) return;

    const result = addItem(this._charData, item.itemId, item.quantity);

    // Remove from world
    const idx = this._groundItems.indexOf(item);
    if (idx !== -1) this._groundItems.splice(idx, 1);
    item.destroy();

    this._showPickupToast(result.message, result.ok);
    this._updateHud();
  }

  /** Spawn a dropped item near the player's current tile. */
  private _spawnDroppedItem(itemId: string): void {
    const def: GroundItemDef = {
      itemId,
      quantity: 1,
      col: this.player.col,
      row: this.player.row + 1,
    };
    const gi = new GroundItem(this, def, (item) => this._pickupItem(item));
    this.uiCam.ignore(gi.dot);
    this.uiCam.ignore(gi.label);
    this._groundItems.push(gi);
  }

  private _showPickupToast(message: string, ok: boolean): void {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height - 60, message, {
      fontFamily: 'monospace',
      fontSize:   '12px',
      color:       ok ? '#44ff44' : '#ff4444',
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(200_002).setAlpha(0);

    this.cameras.main.ignore(toast);

    this.tweens.add({
      targets:  toast,
      alpha:    { from: 0, to: 1 },
      duration: 150,
      yoyo:     true,
      hold:     1200,
      onComplete: () => toast.destroy(),
    });
  }

  private _openDialogue(npc: NPC): void {
    // Prevent re-opening if dialogue is already running.
    if (this.scene.isActive('DialogueScene')) return;

    this.scene.launch('DialogueScene', {
      npcId:   npc.dialogueId,
      npcName: npc.name,
    });
  }

  private _setupClickMove(): void {
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      // Don't process map clicks while a dialogue is open.
      if (this.scene.isActive('DialogueScene')) return;

      // Only respond to left-click and only when not in pan-key mode.
      if (ptr.button !== 0) return;
      if (this.player.isMoving) return;

      const cam = this.cameras.main;
      const wx  = cam.scrollX + ptr.x / cam.zoom;
      const wy  = cam.scrollY + ptr.y / cam.zoom;
      const { col, row } = worldToTile(wx, wy);

      if (col < 0 || col >= MAP_W || row < 0 || row >= MAP_H) return;

      const level = this.mapData.levels[this.levelIndex];
      if (level.object[row][col] === OBJ_WALL) return;   // can't walk into walls

      const path = findPath(
        level.object,
        this.player.col, this.player.row,
        col, row,
      );

      this.player.walkPath(path);
    });
  }

  // ── Map rendering ─────────────────────────────────────────────────────────

  /**
   * Destroy all current tile sprites and re-render the given level index.
   * Clamps the camera to the world bounds and centres it on playerStart.
   */
  private _renderLevel(index: number): void {
    // Destroy previous tiles
    for (const img of this.tiles) img.destroy();
    this.tiles = [];

    // Destroy previous NPCs
    for (const npc of this._npcs) npc.destroy();
    this._npcs = [];

    // Destroy previous ground items
    for (const gi of this._groundItems) gi.destroy();
    this._groundItems = [];

    this.levelIndex = index;
    const level = this.mapData.levels[index];

    this._renderLayer(level, 0);   // floor
    this._renderLayer(level, 1);   // objects (walls / doors)
    this._renderLayer(level, 2);   // roof

    // Spawn NPCs for this level (must be after uiCam exists)
    this._spawnNpcs(index);

    // Spawn ground items for this level
    this._spawnGroundItems(level);

    // ── Camera ────────────────────────────────────────────────────────────
    const bounds = mapWorldBounds();
    const cam    = this.cameras.main;
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

    const start = tileToWorld(level.playerStart.col, level.playerStart.row);
    cam.centerOn(start.x, start.y);
  }

  /**
   * Render one tile layer (floor=0, objects=1, roof=2) for the given level.
   */
  private _renderLayer(level: LevelData, layer: 0 | 1 | 2): void {
    const isRoof = layer === 2;

    for (let row = 0; row < MAP_H; row++) {
      for (let col = 0; col < MAP_W; col++) {
        let tileType: number;
        let texKey:   string | undefined;

        if (layer === 0) {
          tileType = level.floor[row][col];
          texKey   = FLOOR_TEX[tileType];
        } else if (layer === 1) {
          tileType = level.object[row][col];
          texKey   = OBJ_TEX[tileType];
        } else {
          tileType = level.roof[row][col];
          texKey   = ROOF_TEX[tileType];
        }

        if (!texKey || tileType === T_EMPTY) continue;

        const pos   = tileToWorld(col, row);
        const depth = tileDepth(col, row, layer);

        const img = this.add.image(pos.x, pos.y, texKey);
        img.setOrigin(0.5, 0);   // anchor = top vertex of the diamond
        img.setDepth(depth);

        if (isRoof) img.setAlpha(0.55);

        // World tiles are visible to the main (zoomable) camera only.
        this.uiCam.ignore(img);
        this.tiles.push(img);
      }
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private _buildHud(): void {
    const style = {
      fontFamily: 'monospace',
      fontSize:   '12px',
      color:      '#c8a000',
      backgroundColor: '#00000099',
      padding: { x: 6, y: 4 },
    };
    const { width, height } = this.scale;

    // HUD objects live at screen-space coordinates (0–800, 0–600).
    // uiCam has zoom=1 / scroll=(0,0) so world coords == screen coords here.
    // No setScrollFactor needed — the main camera never sees these objects.

    this.hudLevel = this.add.text(10, 10, '', style).setDepth(200_000);

    this.hudCoord = this.add.text(width - 10, 10, '', { ...style, align: 'right' })
      .setOrigin(1, 0)
      .setDepth(200_000);

    this.hudTile = this.add.text(10, height - 10, '', style)
      .setOrigin(0, 1)
      .setDepth(200_000);

    // Character stats panel (bottom-right)
    this.hudChar = this.add.text(width - 10, height - 10, '', {
      ...style, align: 'right', color: '#c8a000',
    }).setOrigin(1, 1).setDepth(200_000);

    const hint = this.add.text(
      width / 2, height - 10,
      'WASD pan  |  [1][2][3] levels  |  +/- / wheel zoom  |  click to move  |  [I] inventory',
      { ...style, color: '#607030' },
    ).setOrigin(0.5, 1).setDepth(200_000);

    // Exclude all HUD elements from the main (world) camera in one call.
    this.cameras.main.ignore([this.hudLevel, this.hudCoord, this.hudTile, this.hudChar, hint]);

    this._updateHud();
  }

  private _updateHud(): void {
    const level = this.mapData.levels[this.levelIndex];
    const cam   = this.cameras.main;

    this.hudLevel.setText(`${this.mapData.name}  —  ${level.name}`);

    this.hudCoord.setText(
      `zoom ×${cam.zoom.toFixed(2)}  (${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)})`,
    );

    // Mouse world position → tile under cursor
    const ptr = this.input.activePointer;
    const wx  = cam.scrollX + ptr.x / cam.zoom;
    const wy  = cam.scrollY + ptr.y / cam.zoom;
    const { col, row } = worldToTile(wx, wy);

    const inMap = col >= 0 && col < MAP_W && row >= 0 && row < MAP_H;
    this.hudTile.setText(inMap
      ? `(${col},${row})  f:${level.floor[row][col]} o:${level.object[row][col]} r:${level.roof[row][col]}`
      : `(${col},${row})  —`,
    );

    // Character stats panel
    if (this._charData) {
      const c = this._charData;
      this.hudChar.setText(
        `${c.name}  LV${c.level}\n` +
        `HP ${c.hp}/${c.max_hp}  AP ${c.ap}/${c.max_ap}`,
      );
    }
  }

  // ── Level label flash ──────────────────────────────────────────────────────

  private _flashLevelBanner(text: string): void {
    const banner = this.add.text(
      this.scale.width / 2, this.scale.height / 2 - 40, text,
      {
        fontFamily: 'monospace',
        fontSize:   '22px',
        color:      '#c8a000',
        backgroundColor: '#00000099',
        padding: { x: 18, y: 10 },
      },
    ).setOrigin(0.5)
      .setDepth(200_001)
      .setAlpha(0);

    // Banner is a HUD element — exclude from the world camera.
    this.cameras.main.ignore(banner);

    this.tweens.add({
      targets:  banner,
      alpha:    { from: 0, to: 1 },
      duration: 180,
      yoyo:     true,
      hold:     900,
      onComplete: () => banner.destroy(),
    });
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this._handlePan(delta);
    this._handleLevelSwitch();
    this._handleZoom();
    this._handleInventoryKey();
    this._handlePendingDrop();
    this._updateHud();
  }

  private _handleInventoryKey(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keyInventory)) {
      if (this.scene.isActive('InventoryScene')) {
        this.scene.stop('InventoryScene');
      } else if (!this.scene.isActive('DialogueScene')) {
        this.scene.launch('InventoryScene');
      }
    }
  }

  /** Check if InventoryScene dropped an item and spawn it in the world. */
  private _handlePendingDrop(): void {
    const drop = this.registry.get('pendingDrop') as { itemId: string; qty: number } | null;
    if (drop) {
      this.registry.set('pendingDrop', null);
      this._spawnDroppedItem(drop.itemId);
      this._showPickupToast(`Dropped ${drop.itemId}.`, true);
    }
  }

  private _handlePan(delta: number): void {
    const cam   = this.cameras.main;
    const speed = PAN_SPEED / cam.zoom;   // pan speed compensates for zoom
    const dt    = delta / 1000;

    const moveLeft  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const moveRight = this.cursors.right.isDown || this.wasd.right.isDown;
    const moveUp    = this.cursors.up.isDown    || this.wasd.up.isDown;
    const moveDown  = this.cursors.down.isDown  || this.wasd.down.isDown;

    if (moveLeft)  cam.scrollX -= speed * dt;
    if (moveRight) cam.scrollX += speed * dt;
    if (moveUp)    cam.scrollY -= speed * dt;
    if (moveDown)  cam.scrollY += speed * dt;
  }

  private _handleLevelSwitch(): void {
    const target =
      Phaser.Input.Keyboard.JustDown(this.keyLevel1) ? 0 :
      Phaser.Input.Keyboard.JustDown(this.keyLevel2) ? 1 :
      Phaser.Input.Keyboard.JustDown(this.keyLevel3) ? 2 :
      -1;

    if (target === -1 || target === this.levelIndex) return;
    if (target >= this.mapData.levels.length) return;

    this._renderLevel(target);
    this._spawnPlayer(target);
    const level = this.mapData.levels[target];
    this._flashLevelBanner(level.name);
  }

  private _handleZoom(): void {
    const cam = this.cameras.main;
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomIn)) {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZoomOut)) {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
    }
  }
}
