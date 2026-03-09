/**
 * Enemy.ts — Enemy entity for the isometric map.
 *
 * Visual representation (placeholder until FRM sprites are available):
 *   • Filled circle — colour coded by enemy type
 *   • Name label above the dot
 *   • HP bar below the dot (green → yellow → red)
 *
 * Coordinate contract: same as Player — dot centred on the tile's
 * lower-centre world point (pos.y + FEET_OFFSET).
 *
 * Death: isDead flag set immediately; visual objects fade and self-destruct
 * after a 600 ms tween so the scene can clean up at its leisure.
 */

import Phaser from 'phaser';
import { tileToWorld, tileDepth } from '../systems/IsoRenderer';
import type { EnemyDef } from '../data/enemies';

const FEET_OFFSET = 24;   // world-Y offset below tile top vertex
const DOT_RADIUS  =  8;
const BAR_W       = 28;
const BAR_H       =  4;

export class Enemy {
  // ── Data ──────────────────────────────────────────────────────────────────
  readonly def: EnemyDef;
  hp:    number;
  ap:    number;
  col:   number;
  row:   number;
  isDead = false;

  // ── Visuals (public so LocationScene can pass to uiCam.ignore) ────────────
  readonly sprite:   Phaser.GameObjects.Arc;
  readonly label:    Phaser.GameObjects.Text;
  readonly hpBarBg:  Phaser.GameObjects.Rectangle;
  readonly hpBar:    Phaser.GameObjects.Rectangle;

  private readonly _scene: Phaser.Scene;

  constructor(
    scene:   Phaser.Scene,
    def:     EnemyDef,
    col:     number,
    row:     number,
    onClick: (enemy: Enemy) => void,
  ) {
    this._scene = scene;
    this.def    = def;
    this.col    = col;
    this.row    = row;
    this.hp     = def.hp;
    this.ap     = def.maxAP;

    const { wx, wy, depth } = this._coords(col, row);

    // ── Dot ─────────────────────────────────────────────────────────────
    this.sprite = scene.add.circle(wx, wy, DOT_RADIUS, def.color, 0.92)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    this.sprite.on('pointerdown', (_ptr: Phaser.Input.Pointer) => onClick(this));
    this.sprite.on('pointerover', () => this.sprite.setScale(1.4));
    this.sprite.on('pointerout',  () => this.sprite.setScale(1.0));

    // ── Label ────────────────────────────────────────────────────────────
    this.label = scene.add.text(wx, wy - DOT_RADIUS - 6, def.name, {
      fontFamily:      'monospace',
      fontSize:        '9px',
      color:           '#ffff88',
      backgroundColor: '#00000088',
      padding:         { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(depth + 0.1);

    // ── HP bar ───────────────────────────────────────────────────────────
    const barY = wy + DOT_RADIUS + 6;
    this.hpBarBg = scene.add
      .rectangle(wx, barY, BAR_W, BAR_H, 0x440000)
      .setOrigin(0.5).setDepth(depth + 0.1);

    this.hpBar = scene.add
      .rectangle(wx - BAR_W / 2, barY, BAR_W, BAR_H, 0x44ff00)
      .setOrigin(0, 0.5).setDepth(depth + 0.2);

    this._updateHpBar();
  }

  // ── Combat state ──────────────────────────────────────────────────────────

  restoreAP(): void { this.ap = this.def.maxAP; }

  consumeAP(amount: number): boolean {
    if (this.ap < amount) return false;
    this.ap -= amount;
    return true;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this._updateHpBar();
  }

  // ── Visual updates ────────────────────────────────────────────────────────

  /** Tween the sprite to a new tile, then snap label + HP bar. */
  moveTo(col: number, row: number, onComplete?: () => void): void {
    this.col = col;
    this.row = row;
    const { wx, wy, depth } = this._coords(col, row);

    this._scene.tweens.add({
      targets:  this.sprite,
      x: wx, y: wy,
      duration: 280,
      ease:     'Linear',
      onComplete: () => {
        this._snapVisuals(wx, wy, depth);
        onComplete?.();
      },
    });
  }

  /** Flash red then fade out; sets isDead immediately. */
  die(): void {
    this.isDead = true;
    this.sprite.disableInteractive();

    this._scene.tweens.add({
      targets:  [this.sprite, this.label, this.hpBarBg, this.hpBar],
      alpha:    { from: 1, to: 0 },
      duration: 600,
      ease:     'Power2',
      onComplete: () => this._destroyVisuals(),
    });
  }

  destroy(): void {
    this._destroyVisuals();
  }

  // ── Camera exclusion ──────────────────────────────────────────────────────

  /** Exclude all visual objects from the given camera (call with uiCam). */
  excludeFromCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
    cam.ignore(this.sprite);
    cam.ignore(this.label);
    cam.ignore(this.hpBarBg);
    cam.ignore(this.hpBar);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _coords(col: number, row: number) {
    const pos   = tileToWorld(col, row);
    const wx    = pos.x;
    const wy    = pos.y + FEET_OFFSET;
    const depth = tileDepth(col, row, 1) + 0.6;
    return { wx, wy, depth };
  }

  private _snapVisuals(wx: number, wy: number, depth: number): void {
    this.sprite.setPosition(wx, wy).setDepth(depth);
    this.label.setPosition(wx, wy - DOT_RADIUS - 6).setDepth(depth + 0.1);
    const barY = wy + DOT_RADIUS + 6;
    this.hpBarBg.setPosition(wx, barY).setDepth(depth + 0.1);
    this.hpBar.setPosition(wx - BAR_W / 2, barY).setDepth(depth + 0.2);
  }

  private _updateHpBar(): void {
    const pct   = this.hp / this.def.hp;
    const color = pct > 0.5 ? 0x44ff00 : pct > 0.25 ? 0xffcc00 : 0xff4400;
    this.hpBar.setFillStyle(color);
    this.hpBar.setDisplaySize(BAR_W * pct, BAR_H);
  }

  private _destroyVisuals(): void {
    if (this.sprite.scene)   this.sprite.destroy();
    if (this.label.scene)    this.label.destroy();
    if (this.hpBarBg.scene)  this.hpBarBg.destroy();
    if (this.hpBar.scene)    this.hpBar.destroy();
  }
}
