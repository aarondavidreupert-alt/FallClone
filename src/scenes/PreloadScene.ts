/**
 * PreloadScene.ts — Generates all placeholder tile textures and wires up map data.
 *
 * Since no external image assets exist yet, every texture is drawn
 * programmatically using Phaser's Graphics API and baked into the texture cache
 * via Graphics.generateTexture().
 *
 * Texture catalogue
 * ─────────────────
 * tx_floor   80×36   Standard vault floor  — dark grey isometric diamond
 * tx_floor2  80×36   Command-centre floor  — dark green isometric diamond
 * tx_floor3  80×36   Metal grating         — blue-steel isometric diamond
 * tx_wall    80×72   Solid wall block      — iso box (top + two front faces)
 * tx_door    80×36   Open door sill        — orange-brown diamond
 * tx_roof    80×36   Ceiling tile          — light grey diamond (drawn @0.5α)
 *
 * Each floor/roof diamond has left-half shading for a subtle 3-D look.
 * The wall box has three distinct face colours for clear depth perception.
 *
 * After textures are generated the scene transitions to LocationScene, passing
 * the map data through the Phaser scene registry.
 */

import Phaser from 'phaser';
import {
  TILE_W, TILE_H, HALF_W, HALF_H, WALL_H,
  TX_FLOOR, TX_FLOOR2, TX_FLOOR3, TX_WALL, TX_DOOR, TX_ROOF, TX_PLAYER,
} from '../utils/constants';
import { DIAMOND_POINTS, wallBoxPoints } from '../systems/IsoRenderer';
import { buildVaultMap } from '../data/vaultMap';

// ── Colour palette ─────────────────────────────────────────────────────────────
// All colours follow Fallout's dark, blue-tinted vault aesthetic.
const C = {
  // Floor — standard (grey-blue metal)
  floor_fill:    0x3a3a52,
  floor_shade:   0x2d2d42,   // left-half shadow
  floor_outline: 0x5a5a7a,

  // Floor2 — command centre (dark green)
  floor2_fill:    0x1e3828,
  floor2_shade:   0x162a1e,
  floor2_outline: 0x2d5840,

  // Floor3 — heavy metal grating (blue-steel)
  floor3_fill:    0x2d3042,
  floor3_shade:   0x222438,
  floor3_outline: 0x454865,

  // Wall box — three distinct faces
  wall_top:      0x32324e,   // top face (lit)
  wall_right:    0x26263c,   // right front face (medium shadow)
  wall_left:     0x1c1c2e,   // left front face (deepest shadow)
  wall_outline:  0x505078,

  // Door sill — warm amber-brown
  door_fill:    0x6b4218,
  door_shade:   0x52310e,
  door_outline: 0x9a6028,

  // Roof / ceiling — lighter grey (drawn at 0.5 alpha by the renderer)
  roof_fill:    0x484862,
  roof_shade:   0x38384e,
  roof_outline: 0x6a6a88,
};

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // ── Status overlay ────────────────────────────────────────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    const label = this.add.text(width / 2, height / 2 - 20, 'GENERATING ASSETS...', {
      fontFamily: 'monospace',
      fontSize:   '14px',
      color:      '#c8a000',
    }).setOrigin(0.5);

    const sub = this.add.text(width / 2, height / 2 + 16, '', {
      fontFamily: 'monospace',
      fontSize:   '11px',
      color:      '#607030',
    }).setOrigin(0.5);

    // ── Generate textures (synchronous) ───────────────────────────────────────
    const steps: Array<[string, () => void]> = [
      ['Floor tiles',    () => this._genFloor()   ],
      ['Wall blocks',    () => this._genWall()    ],
      ['Door tiles',     () => this._genDoor()    ],
      ['Roof tiles',     () => this._genRoof()    ],
      ['Player sprite',  () => this._genPlayer()  ],
      ['Building map',   () => this._storeMap()   ],
    ];

    // Use a short deferred loop so the browser paints the overlay first
    let step = 0;
    const runNext = (): void => {
      if (step >= steps.length) {
        label.setText('VAULT 13 LOADED');
        this.time.delayedCall(400, () => this.scene.start('CharacterCreationScene'));
        return;
      }
      const [name, fn] = steps[step++];
      sub.setText(name);
      fn();
      this.time.delayedCall(80, runNext);
    };

    this.time.delayedCall(100, runNext);
  }

  // ── Texture generators ────────────────────────────────────────────────────

  /** Draw a shaded isometric diamond and bake it into the texture cache. */
  private _genDiamond(
    key: string,
    fill: number,
    shade: number,
    outline: number,
  ): void {
    if (this.textures.exists(key)) return;

    const g = this.add.graphics();

    // Base fill — full diamond
    g.fillStyle(fill);
    g.fillPoints([...DIAMOND_POINTS], true);

    // Left-half shadow (top vertex → bottom vertex → left vertex triangle)
    g.fillStyle(shade, 0.35);
    g.fillTriangle(
      HALF_W, 0,          // top vertex
      HALF_W, TILE_H,     // bottom vertex
      0,      HALF_H,     // left vertex
    );

    // Outline
    g.lineStyle(1, outline, 1);
    g.strokePoints([...DIAMOND_POINTS], true);

    g.generateTexture(key, TILE_W, TILE_H);
    g.destroy();
  }

  private _genFloor(): void {
    this._genDiamond(TX_FLOOR,  C.floor_fill,  C.floor_shade,  C.floor_outline);
    this._genDiamond(TX_FLOOR2, C.floor2_fill, C.floor2_shade, C.floor2_outline);
    this._genDiamond(TX_FLOOR3, C.floor3_fill, C.floor3_shade, C.floor3_outline);
  }

  private _genWall(): void {
    if (this.textures.exists(TX_WALL)) return;

    const spriteH = TILE_H + WALL_H;   // 36 + 36 = 72
    const g = this.add.graphics();

    // Right front face (medium tone — secondary light source)
    g.fillStyle(C.wall_right);
    g.fillPoints([...wallBoxPoints.rightFace], true);

    // Left front face (darkest — deepest shadow)
    g.fillStyle(C.wall_left);
    g.fillPoints([...wallBoxPoints.leftFace], true);

    // Top face (lightest — catches the most light from above)
    g.fillStyle(C.wall_top);
    g.fillPoints([...wallBoxPoints.topFace], true);

    // Edge lines — inner seams and silhouette
    g.lineStyle(1, C.wall_outline, 0.9);
    // Silhouette
    g.strokePoints([...wallBoxPoints.outline], true);
    // Seam: top-face bottom edge (left)
    g.lineBetween(HALF_W, TILE_H, 0,      HALF_H);
    // Seam: top-face bottom edge (right)
    g.lineBetween(HALF_W, TILE_H, TILE_W, HALF_H);
    // Seam: front centre vertical
    g.lineBetween(HALF_W, TILE_H, HALF_W, spriteH);

    g.generateTexture(TX_WALL, TILE_W, spriteH);
    g.destroy();
  }

  private _genDoor(): void {
    this._genDiamond(TX_DOOR, C.door_fill, C.door_shade, C.door_outline);
  }

  /**
   * Player sprite — amber circle with a darker outline.
   * Sprite canvas: 28×36px.  The circle centre sits at (14, 14) so the
   * bottom 8px act as a "shadow/feet" area and the origin(0.5,1) anchor
   * places the character visually above the tile centre.
   */
  private _genPlayer(): void {
    if (this.textures.exists(TX_PLAYER)) return;

    const W = 28, H = 36;
    const g = this.add.graphics();

    // Drop shadow (ellipse at bottom)
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(W / 2, H - 6, W * 0.8, 8);

    // Body — amber/gold fill
    g.fillStyle(0xc8a000, 1);
    g.fillCircle(W / 2, 14, 12);

    // Darker outline
    g.lineStyle(2, 0x7a6000, 1);
    g.strokeCircle(W / 2, 14, 12);

    // Bright highlight (top-left)
    g.fillStyle(0xffe066, 0.5);
    g.fillCircle(W / 2 - 4, 9, 5);

    g.generateTexture(TX_PLAYER, W, H);
    g.destroy();
  }

  private _genRoof(): void {
    this._genDiamond(TX_ROOF, C.roof_fill, C.roof_shade, C.roof_outline);
  }

  /** Build the map and store it in the Phaser scene registry for LocationScene. */
  private _storeMap(): void {
    const map = buildVaultMap();
    this.registry.set('mapData', map);
  }
}
