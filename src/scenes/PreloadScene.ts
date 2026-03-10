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
import {
  tileUrl, critterUrl, critterMetaUrl,
  hasTiles, hasCritters,
  type TileRole,
} from '../loaders/AssetRegistry';

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

// ── Internal loader keys for raw sprite assets ─────────────────────────────────
const RAW_PLAYER     = 'raw_player_sheet';
const RAW_NPC        = 'raw_npc_sheet';
const META_PLAYER    = 'meta_player_json';
const META_NPC       = 'meta_npc_json';

// ── Sprite cell metadata from frm_to_png.py JSON ─────────────────────────────
interface FrmMeta {
  fps:          number;
  frames_per_dir: number;
  cell_width:   number;
  cell_height:  number;
  sheet_width:  number;
  sheet_height: number;
}

export class PreloadScene extends Phaser.Scene {

  // Track which tile keys are loaded via real assets (not generated)
  private _realLoads = new Set<string>();

  constructor() {
    super({ key: 'PreloadScene' });
  }

  // ── Phaser preload — batch-loads real assets ─────────────────────────────────

  preload(): void {
    this._setupLoadingUI();
    this._loadRealTiles();
    this._loadRealSprites();
  }

  // ── Loading progress UI ───────────────────────────────────────────────────────

  private _statusText!: Phaser.GameObjects.Text;

  private _setupLoadingUI(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    this._statusText = this.add.text(width / 2, height / 2 - 20, 'LOADING ASSETS…', {
      fontFamily: 'monospace',
      fontSize:   '14px',
      color:      '#c8a000',
    }).setOrigin(0.5);

    const sub = this.add.text(width / 2, height / 2 + 16, '', {
      fontFamily: 'monospace',
      fontSize:   '11px',
      color:      '#607030',
    }).setOrigin(0.5);

    // Progress bar background
    const barX = width / 2 - 150;
    const barY = height / 2 + 44;
    this.add.rectangle(barX + 150, barY, 300, 8, 0x222211);
    const bar = this.add.rectangle(barX, barY, 0, 6, 0xc8a000).setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      bar.width = 300 * value;
    });
    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      sub.setText(file.key.replace(/^(raw_|meta_)/, ''));
    });

    if (hasTiles() || hasCritters()) {
      sub.setText('Fallout 1 assets found — loading…');
    } else {
      sub.setText('No converted assets found — using placeholders');
    }
  }

  // ── Real tile loading ─────────────────────────────────────────────────────────

  private _loadRealTiles(): void {
    const roles: TileRole[] = ['floor', 'floor2', 'floor3', 'wall', 'door', 'roof'];
    const keys: Record<TileRole, string> = {
      floor: TX_FLOOR, floor2: TX_FLOOR2, floor3: TX_FLOOR3,
      wall: TX_WALL, door: TX_DOOR, roof: TX_ROOF,
    };

    for (const role of roles) {
      const url = tileUrl(role);
      if (!url) continue;
      this.load.image(keys[role], url);
      this._realLoads.add(keys[role]);
    }
  }

  // ── Real sprite loading ───────────────────────────────────────────────────────

  private _loadRealSprites(): void {
    const playerUrl = critterUrl('player');
    if (playerUrl) {
      this.load.image(RAW_PLAYER, playerUrl);
      const metaUrl = critterMetaUrl('player');
      if (metaUrl) this.load.json(META_PLAYER, metaUrl);
      this._realLoads.add(TX_PLAYER);
    }

    const npcUrl = critterUrl('npc');
    if (npcUrl) {
      this.load.image(RAW_NPC, npcUrl);
      const metaUrl = critterMetaUrl('npc');
      if (metaUrl) this.load.json(META_NPC, metaUrl);
      this._realLoads.add(TX_NPC);
    }
  }

  // ── Phaser create — procedural fallbacks + map build ─────────────────────────

  create(): void {
    this._statusText?.setText('BUILDING VAULT 13…');

    // ── Tile textures ───────────────────────────────────────────────────────────
    if (!this.textures.exists(TX_FLOOR))  this._genFloor();
    if (!this.textures.exists(TX_FLOOR2)) this._genFloor();  // 2nd colour variant
    if (!this.textures.exists(TX_FLOOR3)) this._genFloor3();
    if (!this.textures.exists(TX_WALL))   this._genWall();
    if (!this.textures.exists(TX_DOOR))   this._genDoor();
    if (!this.textures.exists(TX_ROOF))   this._genRoof();

    // Floor2: if a real floor was loaded but not floor2, tint it differently
    if (this.textures.exists(TX_FLOOR) && !this.textures.exists(TX_FLOOR2)) {
      this._genDiamond(TX_FLOOR2, C.floor2_fill, C.floor2_shade, C.floor2_outline);
    }

    // ── Sprite textures ─────────────────────────────────────────────────────────
    if (this._realLoads.has(TX_PLAYER) && this.textures.exists(RAW_PLAYER)) {
      this._extractSpriteFrame(RAW_PLAYER, META_PLAYER, TX_PLAYER);
    } else if (!this.textures.exists(TX_PLAYER)) {
      this._genCircleSprite(TX_PLAYER, 0xc8a000, 0x7a6000, 0xffe066);
    }

    if (this._realLoads.has(TX_NPC) && this.textures.exists(RAW_NPC)) {
      this._extractSpriteFrame(RAW_NPC, META_NPC, TX_NPC);
    } else if (!this.textures.exists(TX_NPC)) {
      this._genCircleSprite(TX_NPC, 0x2a5080, 0x163050, 0x66aadd);
    }

    // ── Log results ─────────────────────────────────────────────────────────────
    const realTileCount = [TX_FLOOR, TX_FLOOR2, TX_FLOOR3, TX_WALL, TX_DOOR, TX_ROOF]
      .filter(k => this._realLoads.has(k) && this.textures.exists(k)).length;
    const realSpriteCount = [TX_PLAYER, TX_NPC]
      .filter(k => this._realLoads.has(k) && this.textures.exists(k)).length;

    if (realTileCount > 0 || realSpriteCount > 0) {
      console.log(`[PreloadScene] Loaded real assets: ${realTileCount} tiles, ${realSpriteCount} sprites`);
    } else {
      console.log('[PreloadScene] No real assets found — using procedural placeholders.');
    }

    // ── Map data ─────────────────────────────────────────────────────────────────
    const map = buildVaultMap();
    this.registry.set('mapData', map);

    this._statusText?.setText('VAULT 13 READY');
    this.time.delayedCall(400, () => this.scene.start('CharacterCreationScene'));
  }

  // ── Sprite frame extractor ────────────────────────────────────────────────────

  /**
   * Extract the south-facing (direction 3, row index 3) first frame from a
   * multi-direction spritesheet produced by frm_to_png.py and save it as a
   * new texture under `targetKey`.
   *
   * Spritesheet layout: rows = directions (N NE SE S SW NW), cols = frames.
   * South = row 3.  We draw that row-slice into a RenderTexture the size of
   * one cell, so the rest of the engine can use it as a plain image.
   *
   * If no JSON metadata is available (cell size unknown), falls back to using
   * the full spritesheet texture scaled to 28×36 (player placeholder size).
   */
  private _extractSpriteFrame(
    sheetKey:  string,
    metaKey:   string,
    targetKey: string,
  ): void {
    const meta = this.cache.json.has(metaKey)
      ? this.cache.json.get(metaKey) as FrmMeta
      : null;

    const cellW = meta?.cell_width  ?? 28;
    const cellH = meta?.cell_height ?? 36;

    // South-facing direction = index 3 → y offset in spritesheet
    const southRow = 3;
    const srcY     = southRow * cellH;

    // Check the spritesheet is tall enough to have a south row
    const tex = this.textures.get(sheetKey);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const sheetH = src.height ?? cellH;
    const effectiveSrcY = srcY < sheetH ? srcY : 0;  // fallback to row 0

    // Render just that cell into a new texture
    const rt = this.add.renderTexture(0, 0, cellW, cellH);
    rt.draw(sheetKey, -0, -effectiveSrcY);  // offset so the target row lands at y=0
    rt.saveTexture(targetKey);
    rt.setVisible(false);
    // Don't destroy — RT backing the saved texture must persist

    console.log(`[PreloadScene] Extracted sprite frame: ${sheetKey} row ${southRow} → ${targetKey} (${cellW}×${cellH})`);
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
    this._genDiamond(TX_FLOOR,  C.floor_fill,  C.floor_shade,  C.floor_outline);
    // floor2 and floor3 get their own colours if not handled by caller
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
