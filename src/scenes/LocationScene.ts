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

export class LocationScene extends Phaser.Scene {
  // ── State ─────────────────────────────────────────────────────────────────
  private mapData!:    VaultMapData;
  private levelIndex = 0;
  private tiles:       Phaser.GameObjects.Image[] = [];

  // ── Input ─────────────────────────────────────────────────────────────────
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up:    Phaser.Input.Keyboard.Key;
    down:  Phaser.Input.Keyboard.Key;
    left:  Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private keyLevel1!: Phaser.Input.Keyboard.Key;
  private keyLevel2!: Phaser.Input.Keyboard.Key;
  private keyLevel3!: Phaser.Input.Keyboard.Key;
  private keyZoomIn!: Phaser.Input.Keyboard.Key;
  private keyZoomOut!: Phaser.Input.Keyboard.Key;

  // ── HUD ───────────────────────────────────────────────────────────────────
  private hudLevel!: Phaser.GameObjects.Text;
  private hudCoord!: Phaser.GameObjects.Text;
  private hudTile!:  Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LocationScene' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  create(): void {
    this.mapData = this.registry.get('mapData') as VaultMapData;

    this._setupInput();
    this._renderLevel(0);
    this._buildHud();
    this._setupMouseWheel();
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
    this.keyLevel1  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyLevel2  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyLevel3  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyZoomIn  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
    this.keyZoomOut = kb.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);
  }

  private _setupMouseWheel(): void {
    this.input.on('wheel', (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
      const cam  = this.cameras.main;
      const zoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, ZOOM_MIN, ZOOM_MAX);
      cam.setZoom(zoom);
    });
  }

  // ── Map rendering ─────────────────────────────────────────────────────────

  /**
   * Destroy all current tile sprites and re-render the given level index.
   * Clamps the camera to the world bounds and centres it on playerStart.
   */
  private _renderLevel(index: number): void {
    // Destroy previous sprites
    for (const img of this.tiles) img.destroy();
    this.tiles = [];

    this.levelIndex = index;
    const level = this.mapData.levels[index];

    this._renderLayer(level, 0);   // floor
    this._renderLayer(level, 1);   // objects (walls / doors)
    this._renderLayer(level, 2);   // roof

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

    // Level name — top-left
    this.hudLevel = this.add.text(10, 10, '', style)
      .setScrollFactor(0)
      .setDepth(200_000);

    // Camera world position — top-right
    this.hudCoord = this.add.text(this.scale.width - 10, 10, '', {
      ...style, align: 'right',
    }).setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(200_000);

    // Tile under cursor — bottom-left
    this.hudTile = this.add.text(10, this.scale.height - 10, '', style)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(200_000);

    // Controls hint — bottom-right (no field ref needed; fire-and-forget)
    this.add.text(
      this.scale.width - 10, this.scale.height - 10,
      'WASD/↑↓←→ pan  |  1 2 3 levels  |  +/- / wheel zoom',
      { ...style, color: '#607030' },
    ).setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(200_000);

    this._updateHud();
  }

  private _updateHud(): void {
    const level = this.mapData.levels[this.levelIndex];
    const cam   = this.cameras.main;

    this.hudLevel.setText(`${this.mapData.name}  —  ${level.name}`);

    this.hudCoord.setText(
      `cam (${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)})` +
      `  zoom ×${cam.zoom.toFixed(2)}`,
    );

    // Mouse world position → tile under cursor
    const ptr = this.input.activePointer;
    const wx  = cam.scrollX + ptr.x / cam.zoom;
    const wy  = cam.scrollY + ptr.y / cam.zoom;
    const { col, row } = worldToTile(wx, wy);

    const inMap = col >= 0 && col < MAP_W && row >= 0 && row < MAP_H;
    if (inMap) {
      const floorT  = level.floor[row][col];
      const objectT = level.object[row][col];
      const roofT   = level.roof[row][col];
      this.hudTile.setText(
        `tile (${col}, ${row})  floor:${floorT}  obj:${objectT}  roof:${roofT}`,
      );
    } else {
      this.hudTile.setText(`tile (${col}, ${row})  [out of bounds]`);
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
      .setScrollFactor(0)
      .setDepth(200_001)
      .setAlpha(0);

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
    this._updateHud();
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
