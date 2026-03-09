/**
 * GroundItem.ts — An item lying on the ground in the world.
 *
 * Renders as a small coloured dot (placeholder for FRM sprites) at a tile
 * position, with a text label above it.  Clickable for pickup.
 *
 * Visual colour by item type:
 *   consumable → green
 *   weapon     → red
 *   armor      → blue
 *   misc       → yellow
 */

import Phaser from 'phaser';
import { tileToWorld, tileDepth } from '../systems/IsoRenderer';
import { getItem } from '../data/items';

const TYPE_COLORS: Record<string, number> = {
  consumable: 0x44ff44,
  weapon:     0xff4444,
  armor:      0x4488ff,
  misc:       0xffcc00,
};

export interface GroundItemDef {
  itemId:   string;
  quantity: number;
  col:      number;
  row:      number;
}

export class GroundItem {
  readonly itemId:   string;
  readonly quantity: number;
  readonly col:      number;
  readonly row:      number;

  readonly dot:   Phaser.GameObjects.Arc;
  readonly label: Phaser.GameObjects.Text;

  private _onPickup: (item: GroundItem) => void;

  constructor(
    scene: Phaser.Scene,
    def: GroundItemDef,
    onPickup: (item: GroundItem) => void,
  ) {
    this.itemId   = def.itemId;
    this.quantity = def.quantity;
    this.col      = def.col;
    this.row      = def.row;
    this._onPickup = onPickup;

    const itemDef = getItem(def.itemId);
    const color   = itemDef ? (TYPE_COLORS[itemDef.type] ?? 0xffffff) : 0xffffff;
    const name    = itemDef?.name ?? def.itemId;

    const pos   = tileToWorld(def.col, def.row);
    const wx    = pos.x;
    const wy    = pos.y + 24;   // slightly below tile centre
    const depth = tileDepth(def.col, def.row, 1) + 0.5;

    // Dot (circle primitive)
    this.dot = scene.add.circle(wx, wy, 5, color, 0.9)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    // Label
    this.label = scene.add.text(wx, wy - 10, name, {
      fontFamily:      'monospace',
      fontSize:        '9px',
      color:           '#ffffff',
      backgroundColor: '#00000088',
      padding:         { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(depth + 0.1);

    // Click → pickup
    this.dot.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.button === 0) this._onPickup(this);
    });

    // Hover highlight
    this.dot.on('pointerover', () => this.dot.setScale(1.5));
    this.dot.on('pointerout',  () => this.dot.setScale(1.0));
  }

  /** Remove from scene. */
  destroy(): void {
    this.dot.destroy();
    this.label.destroy();
  }
}
