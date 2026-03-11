/**
 * PreloadScene.ts — Loads real Fallout 1 assets when available, otherwise
 * generates procedural placeholder textures.
 *
 * Asset loading strategy
 * ──────────────────────
 * 1. preload() runs Phaser's standard asset pipeline using URLs discovered by
 *    AssetRegistry (Vite import.meta.glob at build/dev time).
 * 2. create() checks which textures landed in the cache.  Any missing key gets
 *    a procedurally-generated placeholder so the game always renders correctly.
 *
 * Tile textures (80×36 diamonds for floor / door / roof; 80×72 for walls)
 * ─────────────
 * Real tiles: Fallout 1 FRM files converted to flat PNG by frm_to_png.py.
 * Placeholders: drawn with Phaser Graphics.generateTexture().
 *
 * Sprite textures (player / NPC)
 * ──────────────────────────────
 * Real sprites: multi-direction spritesheet PNG + companion JSON (cell dims).
 * The spritesheet has rows=directions, cols=frames (output of frm_to_png.py).
 * We extract the south-facing direction (row 3) frame 0 into a RenderTexture
 * and save it as TX_PLAYER / TX_NPC so the rest of the engine keeps working
 * unchanged (scene.add.image(x, y, TX_PLAYER)).
 *
 * Placeholder sprites: amber/blue circle on 28×36 canvas.
 *
 * Texture catalogue
 * ─────────────────
 * tx_floor   80×36   Standard vault floor
 * tx_floor2  80×36   Command-centre floor
 * tx_floor3  80×36   Metal grating
 * tx_wall    80×72   Solid wall block
 * tx_door    80×36   Open door sill
 * tx_roof    80×36   Ceiling tile
 * tx_player  28×36   Player character (or real sprite cell)
 * tx_npc     28×36   NPC sprite (or real sprite cell)
 */

import Phaser from 'phaser';
import {
  TILE_W, TILE_H, HALF_W, HALF_H, WALL_H,
  TX_FLOOR, TX_FLOOR2, TX_FLOOR3, TX_WALL, TX_DOOR, TX_ROOF, TX_PLAYER, TX_NPC,
} from '../utils/constants';
import { DIAMOND_POINTS, wallBoxPoints } from '../systems/IsoRenderer';
import { buildVaultMap } from '../data/vaultMap';
import { tryLoadRealMap } from '../loaders/RealMapLoader';
import { EMPTY_LST, type LstData } from '../loaders/AssetRegistry';

// ── Placeholder colour palette ────────────────────────────────────────────────
const C = {
  floor_fill:    0x3a3a52,
  floor_shade:   0x2d2d42,
  floor_outline: 0x5a5a7a,

  floor2_fill:    0x1e3828,
  floor2_shade:   0x162a1e,
  floor2_outline: 0x2d5840,

  floor3_fill:    0x2d3042,
  floor3_shade:   0x222438,
  floor3_outline: 0x454865,

  wall_top:      0x32324e,
  wall_right:    0x26263c,
  wall_left:     0x1c1c2e,
  wall_outline:  0x505078,

  door_fill:    0x6b4218,
  door_shade:   0x52310e,
  door_outline: 0x9a6028,

  roof_fill:    0x484862,
  roof_shade:   0x38384e,
  roof_outline: 0x6a6a88,
};

export class PreloadScene extends Phaser.Scene {

  static readonly MAP_CACHE_KEY = 'map_v13ent';

  constructor() {
    super({ key: 'PreloadScene' });
  }

  // ── Phaser preload ────────────────────────────────────────────────────────────

  preload(): void {
    const lst: LstData = this.registry.get('lstData') ?? EMPTY_LST;
    this._setupLoadingUI(lst);
    this._loadTilesFromLst(lst);

    // Map served from public/assets/maps/ (available at /assets/maps/v13ent.json)
    this.load.json(PreloadScene.MAP_CACHE_KEY, '/assets/maps/v13ent.json');
    this.load.on('fileerror', (file: Phaser.Loader.File) => {
      if (file.key === PreloadScene.MAP_CACHE_KEY) {
        console.log('[PreloadScene] v13ent.json not found — procedural map fallback');
      }
    });
  }

  // ── Loading progress UI ───────────────────────────────────────────────────────

  private _statusText!: Phaser.GameObjects.Text;

  private _setupLoadingUI(lst: LstData): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    this._statusText = this.add.text(width / 2, height / 2 - 20, 'LOADING ASSETS…', {
      fontFamily: 'monospace', fontSize: '14px', color: '#c8a000',
    }).setOrigin(0.5);

    const sub = this.add.text(width / 2, height / 2 + 16,
      lst.tiles.length > 0
        ? `${lst.tiles.length} tiles from LST — loading…`
        : 'No real assets — using procedural placeholders',
      { fontFamily: 'monospace', fontSize: '11px', color: '#607030' },
    ).setOrigin(0.5);

    const barX = width / 2 - 150, barY = height / 2 + 44;
    this.add.rectangle(barX + 150, barY, 300, 8, 0x222211);
    const bar = this.add.rectangle(barX, barY, 0, 6, 0xc8a000).setOrigin(0, 0.5);

    this.load.on('progress',     (v: number)                => { bar.width = 300 * v; });
    this.load.on('fileprogress', (file: Phaser.Loader.File) => { sub.setText(file.key); });
  }

  // ── Tile loading from LST ─────────────────────────────────────────────────────

  /**
   * Register every tile from tiles_lst.json as 'tile_idx_<N>' where N is the
   * array index (= raw MAP floor ID).  LocationScene renders real-map floors
   * using `tile_idx_<rawId>` so the index matches the MAP value directly.
   */
  private _loadTilesFromLst(lst: LstData): void {
    for (let i = 0; i < lst.tiles.length; i++) {
      this.load.image(`tile_idx_${i}`, `/assets/tiles/${lst.tiles[i]}.png`);
    }
    if (lst.tiles.length > 0) {
      console.log(
        `[PreloadScene] Queuing ${lst.tiles.length} tiles from LST ` +
        `(tile_idx_0 … tile_idx_${lst.tiles.length - 1})`,
      );
    }
  }

  // ── Phaser create — procedural fallbacks + map build ─────────────────────────

  create(): void {
    this._statusText?.setText('BUILDING VAULT 13…');

    // Procedural tile textures (placeholders when LST is empty)
    if (!this.textures.exists(TX_FLOOR))  this._genFloor();
    if (!this.textures.exists(TX_FLOOR3)) this._genFloor3();
    if (!this.textures.exists(TX_WALL))   this._genWall();
    if (!this.textures.exists(TX_DOOR))   this._genDoor();
    if (!this.textures.exists(TX_ROOF))   this._genRoof();
    if (!this.textures.exists(TX_FLOOR2)) {
      this._genDiamond(TX_FLOOR2, C.floor2_fill, C.floor2_shade, C.floor2_outline);
    }

    // Procedural sprite textures
    if (!this.textures.exists(TX_PLAYER)) {
      this._genCircleSprite(TX_PLAYER, 0xc8a000, 0x7a6000, 0xffe066);
    }
    if (!this.textures.exists(TX_NPC)) {
      this._genCircleSprite(TX_NPC, 0x2a5080, 0x163050, 0x66aadd);
    }

    // Map data — real V13ENT map (elevation 0 = entrance), or procedural vault
    const realMap = tryLoadRealMap(PreloadScene.MAP_CACHE_KEY, this.cache.json);
    const map = realMap ?? buildVaultMap();

    if (realMap) {
      const lst: LstData = this.registry.get('lstData') ?? EMPTY_LST;
      console.log(
        `[PreloadScene] Real map loaded: ${map.name} ` +
        `(${map.width}×${map.height}, ${lst.tiles.length} tiles in LST)`,
      );
    } else {
      console.log('[PreloadScene] Using procedural vault map (no v13ent.json found)');
    }

    this.registry.set('mapData', map);
    this._statusText?.setText('VAULT 13 READY');
    this.time.delayedCall(400, () => this.scene.start('CharacterCreationScene'));
  }

  // ── Procedural tile generators ────────────────────────────────────────────────

  private _genDiamond(
    key:     string,
    fill:    number,
    shade:   number,
    outline: number,
  ): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(fill);
    g.fillPoints([...DIAMOND_POINTS], true);
    g.fillStyle(shade, 0.35);
    g.fillTriangle(HALF_W, 0, HALF_W, TILE_H, 0, HALF_H);
    g.lineStyle(1, outline, 1);
    g.strokePoints([...DIAMOND_POINTS], true);
    g.generateTexture(key, TILE_W, TILE_H);
    g.destroy();
  }

  private _genFloor(): void {
    this._genDiamond(TX_FLOOR, C.floor_fill, C.floor_shade, C.floor_outline);
  }

  private _genFloor3(): void {
    this._genDiamond(TX_FLOOR3, C.floor3_fill, C.floor3_shade, C.floor3_outline);
  }

  private _genWall(): void {
    if (this.textures.exists(TX_WALL)) return;
    const spriteH = TILE_H + WALL_H;
    const g = this.add.graphics();
    g.fillStyle(C.wall_right);
    g.fillPoints([...wallBoxPoints.rightFace], true);
    g.fillStyle(C.wall_left);
    g.fillPoints([...wallBoxPoints.leftFace], true);
    g.fillStyle(C.wall_top);
    g.fillPoints([...wallBoxPoints.topFace], true);
    g.lineStyle(1, C.wall_outline, 0.9);
    g.strokePoints([...wallBoxPoints.outline], true);
    g.lineBetween(HALF_W, TILE_H, 0,      HALF_H);
    g.lineBetween(HALF_W, TILE_H, TILE_W, HALF_H);
    g.lineBetween(HALF_W, TILE_H, HALF_W, spriteH);
    g.generateTexture(TX_WALL, TILE_W, spriteH);
    g.destroy();
  }

  private _genDoor(): void {
    this._genDiamond(TX_DOOR, C.door_fill, C.door_shade, C.door_outline);
  }

  private _genRoof(): void {
    this._genDiamond(TX_ROOF, C.roof_fill, C.roof_shade, C.roof_outline);
  }

  // ── Procedural circle sprite generator ───────────────────────────────────────

  /**
   * Generate a simple coloured circle sprite (28×36 canvas).
   * Used for player and NPC when real sprites are unavailable.
   */
  private _genCircleSprite(
    key:      string,
    bodyColor: number,
    outlineColor: number,
    highlightColor: number,
  ): void {
    if (this.textures.exists(key)) return;
    const W = 28, H = 36;
    const g = this.add.graphics();
    // Drop shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(W / 2, H - 6, W * 0.8, 8);
    // Body
    g.fillStyle(bodyColor);
    g.fillCircle(W / 2, 14, 12);
    // Outline
    g.lineStyle(2, outlineColor);
    g.strokeCircle(W / 2, 14, 12);
    // Highlight
    g.fillStyle(highlightColor, 0.5);
    g.fillCircle(W / 2 - 4, 9, 5);
    g.generateTexture(key, W, H);
    g.destroy();
  }
}
