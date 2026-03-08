/**
 * NPC.ts — Non-player character entity rendered in the isometric world.
 *
 * An NPC has:
 *   • A world-space sprite depth-sorted with other objects.
 *   • A floating name label above the sprite.
 *   • Hover highlighting (tint) and pointer-cursor feedback.
 *   • A click callback so LocationScene can open dialogue.
 *
 * All display objects are excluded from the uiCam (same contract as tiles and
 * the player sprite) so they zoom and pan with the world camera.
 */

import Phaser from 'phaser';
import { tileToWorld, tileDepth } from '../systems/IsoRenderer';
import { TX_NPC } from '../utils/constants';

export interface NpcDef {
  npcId:      string;
  name:       string;
  dialogueId: string;
  col:        number;
  row:        number;
}

export class NPC {
  readonly sprite: Phaser.GameObjects.Image;
  readonly label:  Phaser.GameObjects.Text;
  readonly npcId:  string;
  readonly name:   string;
  readonly dialogueId: string;

  private readonly _col: number;
  private readonly _row: number;

  constructor(
    scene:     Phaser.Scene,
    def:       NpcDef,
    onInteract: (npc: NPC) => void,
  ) {
    this.npcId      = def.npcId;
    this.name       = def.name;
    this.dialogueId = def.dialogueId;
    this._col       = def.col;
    this._row       = def.row;

    const pos   = tileToWorld(def.col, def.row);
    const depth = tileDepth(def.col, def.row, 1) + 2;   // just above walls

    // ── Sprite ────────────────────────────────────────────────────────────
    this.sprite = scene.add.image(pos.x, pos.y + 36, TX_NPC)
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => this.sprite.setTint(0xffffff))
      .on('pointerout',   () => this.sprite.clearTint())
      .on('pointerdown',  () => onInteract(this));

    // ── Floating name label ───────────────────────────────────────────────
    this.label = scene.add.text(pos.x, pos.y + 36 - 46, def.name, {
      fontFamily: 'monospace',
      fontSize:   '10px',
      color:      '#c8a000',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 2 },
    })
      .setOrigin(0.5, 1)
      .setDepth(depth + 1);
  }

  get col(): number { return this._col; }
  get row(): number { return this._row; }

  /** Remove both the sprite and the label from the scene. */
  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
