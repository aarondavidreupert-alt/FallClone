/**
 * Player.ts — Player entity for the isometric map.
 *
 * Responsibilities
 * ────────────────
 * • Owns a Phaser.GameObjects.Image (tx_player) that renders in world space.
 * • Tracks the player's current tile position (col, row).
 * • Accepts a path (TileCoord[]) and walks along it tile-by-tile via tweens.
 * • Depth-sorts with the world geometry on each move.
 * • Exposes `isMoving` so the scene can block overlapping path requests.
 *
 * Coordinate contract
 * ───────────────────
 * The sprite uses setOrigin(0.5, 1) — bottom-centre of the sprite sits at the
 * tile's world centre (horizontally) and at the tile's bottom vertex vertically.
 * This places the "feet" of the character at the tile centre, matching how
 * Fallout 1 anchors critters.
 */

import Phaser from 'phaser';
import { tileToWorld, tileDepth } from '../systems/IsoRenderer';
import type { TileCoord } from '../systems/Pathfinder';
import { TX_PLAYER } from '../utils/constants';

// Time to walk one tile (milliseconds)
const STEP_MS = 130;

export class Player {
  readonly sprite: Phaser.GameObjects.Image;

  private _col: number;
  private _row: number;
  private _moving = false;
  private _scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, col: number, row: number) {
    this._scene = scene;
    this._col   = col;
    this._row   = row;

    const pos = tileToWorld(col, row);
    // Place feet at tile bottom vertex: origin (0.5, 1) + offset by HALF_H downward
    this.sprite = scene.add.image(
      pos.x,
      pos.y + 36,   // bottom vertex of the diamond (TILE_H below top vertex)
      TX_PLAYER,
    );
    this.sprite.setOrigin(0.5, 1);
    this._updateDepth();
  }

  get col(): number { return this._col; }
  get row(): number { return this._row; }
  get isMoving(): boolean { return this._moving; }

  /**
   * Walk the player along the given path.
   * Each step is a tween to the next tile's world position.
   * Does nothing if already moving or path is empty.
   */
  walkPath(path: TileCoord[]): void {
    if (this._moving || path.length === 0) return;
    this._moving = true;
    this._stepAlong(path, 0);
  }

  /** Teleport to a tile instantly (no tween). */
  teleport(col: number, row: number): void {
    this._col = col;
    this._row = row;
    const pos = tileToWorld(col, row);
    this.sprite.setPosition(pos.x, pos.y + 36);
    this._updateDepth();
  }

  /** Remove the sprite from the scene. */
  destroy(): void {
    this.sprite.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _stepAlong(path: TileCoord[], index: number): void {
    if (index >= path.length) {
      this._moving = false;
      return;
    }

    const { col, row } = path[index];
    const pos = tileToWorld(col, row);

    this._scene.tweens.add({
      targets:  this.sprite,
      x:        pos.x,
      y:        pos.y + 36,
      duration: STEP_MS,
      ease:     'Linear',
      onComplete: () => {
        this._col = col;
        this._row = row;
        this._updateDepth();
        this._stepAlong(path, index + 1);
      },
    });
  }

  private _updateDepth(): void {
    // Use DEPTH_OBJECTS layer so the player renders above floor but below roof.
    // Add a small fractional offset (+1) so the player appears in front of
    // wall objects at the same (col+row) sum.
    this.sprite.setDepth(tileDepth(this._col, this._row, 1) + 1);
  }
}
