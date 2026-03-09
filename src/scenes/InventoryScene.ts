/**
 * InventoryScene.ts — PipBoy inventory overlay.
 *
 * Launched as a parallel scene on top of LocationScene via:
 *   this.scene.launch('InventoryScene')
 *
 * Closed by pressing [I] or [Escape].
 *
 * Layout
 * ──────
 * ┌─────────────────────────────────────────────────────┐
 * │  INVENTORY  [Name]  LV[n]    Weight: xx/xx lbs      │
 * ├──────────────────────────────────────┬──────────────┤
 * │  Item list (scrollable)              │  Detail pane │
 * │  [icon] Name          Qty  Wt  Val  │  Name        │
 * │  ...                                 │  Desc        │
 * │                                      │  [USE][EQUIP]│
 * │                                      │  [DROP]      │
 * ├──────────────────────────────────────┴──────────────┤
 * │  Equipped: Weapon: …  Armor: …                      │
 * │  [I]/[Esc] Close                                    │
 * └─────────────────────────────────────────────────────┘
 *
 * Item list:
 *   - Left-click selects the item (shows detail pane)
 *   - Right-click examines (description popup)
 *
 * Detail pane buttons:
 *   USE  — use a consumable
 *   EQUIP — equip armor or weapon
 *   DROP  — drop the item on the ground (returns {itemId, col, row} via registry)
 */

import Phaser from 'phaser';
import type { CharacterData } from '../utils/types';
import { getItem } from '../data/items';
import {
  useItem, equipItem, dropItem,
  totalWeight, maxCarryWeight,
} from '../systems/InventorySystem';

// ── Layout constants ───────────────────────────────────────────────────────────
const W  = 760;
const H  = 540;
const OX = 20;   // left offset (panel placed at x=OX inside 800px viewport)
const OY = 30;   // top offset

const PANEL_W    = W;
const LIST_X     = OX + 10;
const LIST_Y     = OY + 55;
const LIST_W     = 460;
const LIST_H     = 380;
const ROW_H      = 22;
const DETAIL_X   = OX + LIST_W + 20;
const DETAIL_Y   = OY + 55;
const DETAIL_W   = W - LIST_W - 30;

const COL_NAME   = LIST_X;
const COL_QTY    = LIST_X + 300;
const COL_WT     = LIST_X + 340;
const COL_VAL    = LIST_X + 380;

// ── Colours / styles ──────────────────────────────────────────────────────────
const BG_COLOR   = 0x001a00;
const BG_ALPHA   = 0.95;
const BORDER_COL = '#44aa44';
const TEXT_COL   = '#c8e8c8';
const SEL_COL    = '#ffdd44';
const DIM_COL    = '#607060';
const BTN_OVER   = 0x336633;

const STYLE_HEADER: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '14px', color: '#44ff44',
};
const STYLE_BODY: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: TEXT_COL,
};
const STYLE_DIM: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: DIM_COL,
};
const STYLE_SEL: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: SEL_COL,
};
const STYLE_DETAIL: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: TEXT_COL, wordWrap: { width: DETAIL_W - 10 },
};

// ── Scene ─────────────────────────────────────────────────────────────────────

export class InventoryScene extends Phaser.Scene {

  private _char!:  CharacterData;
  private _rows:   Phaser.GameObjects.Text[] = [];
  private _rowBgs: Phaser.GameObjects.Rectangle[] = [];
  private _selIdx  = -1;

  // Scroll state
  private _scrollOffset = 0;   // first visible row index

  // Detail pane objects (re-built on selection change)
  private _detailGroup: Phaser.GameObjects.GameObject[] = [];

  // HUD text refs
  private _weightText!: Phaser.GameObjects.Text;
  private _equipText!:  Phaser.GameObjects.Text;

  // Close key
  private _keyI!:   Phaser.Input.Keyboard.Key;
  private _keyEsc!: Phaser.Input.Keyboard.Key;

  // Examine popup
  private _examineGroup: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'InventoryScene' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  create(): void {
    this._char    = this.registry.get('characterData') as CharacterData;
    this._selIdx  = -1;
    this._scrollOffset = 0;

    if (!this._char) {
      this.scene.stop();
      return;
    }

    this._buildPanel();
    this._buildList();
    this._buildDetailPane();
    this._buildFooter();

    this._keyI   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this._keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Mouse wheel scroll
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const maxScroll = Math.max(0, this._char.inventory.length - this._visibleRows());
      this._scrollOffset = Phaser.Math.Clamp(
        this._scrollOffset + (dy > 0 ? 1 : -1), 0, maxScroll,
      );
      this._rebuildList();
    });
  }

  // ── Build background panel ─────────────────────────────────────────────────

  private _buildPanel(): void {
    // Semi-transparent backdrop (covers full screen to block clicks to map)
    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7).setDepth(0);

    // Main panel
    this.add.rectangle(OX + PANEL_W / 2, OY + H / 2, PANEL_W, H, BG_COLOR, BG_ALPHA)
      .setDepth(1)
      .setStrokeStyle(1, 0x44aa44);

    // Title
    this.add.text(OX + 10, OY + 10, 'INVENTORY', STYLE_HEADER).setDepth(2);

    const c = this._char;
    this.add.text(OX + 120, OY + 10, `${c.name}  LV${c.level}`, {
      ...STYLE_BODY, color: '#88cc88',
    }).setDepth(2);

    // Weight display (updated on changes)
    this._weightText = this.add.text(OX + PANEL_W - 10, OY + 10, '', {
      ...STYLE_BODY, align: 'right',
    }).setOrigin(1, 0).setDepth(2);
    this._updateWeight();

    // Column headers
    this.add.text(COL_NAME, LIST_Y - 16, 'ITEM', STYLE_DIM).setDepth(2);
    this.add.text(COL_QTY,  LIST_Y - 16, 'QTY', STYLE_DIM).setDepth(2);
    this.add.text(COL_WT,   LIST_Y - 16, 'WT', STYLE_DIM).setDepth(2);
    this.add.text(COL_VAL,  LIST_Y - 16, 'VAL', STYLE_DIM).setDepth(2);

    // Separator lines
    const lineStyle = { color: BORDER_COL };
    this.add.line(0, 0, OX, OY + 40, OX + PANEL_W, OY + 40, 0x44aa44).setOrigin(0).setDepth(2);
    this.add.line(0, 0, OX, OY + H - 50, OX + PANEL_W, OY + H - 50, 0x44aa44).setOrigin(0).setDepth(2);
    this.add.line(0, 0, DETAIL_X - 5, OY + 40, DETAIL_X - 5, OY + H - 50, 0x44aa44).setOrigin(0).setDepth(2);
    void lineStyle; // suppress unused warning
  }

  // ── Item list ──────────────────────────────────────────────────────────────

  private _visibleRows(): number {
    return Math.floor(LIST_H / ROW_H);
  }

  private _buildList(): void {
    this._rows    = [];
    this._rowBgs  = [];
    const vis = this._visibleRows();
    for (let i = 0; i < vis; i++) {
      const ry = LIST_Y + i * ROW_H;
      const bg = this.add.rectangle(
        LIST_X + LIST_W / 2, ry + ROW_H / 2 - 2,
        LIST_W, ROW_H, 0x002200, 0,
      ).setDepth(2).setInteractive();

      const txt = this.add.text(LIST_X, ry, '', STYLE_BODY).setDepth(3);

      const rowIndex = i;
      bg.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        const absIdx = this._scrollOffset + rowIndex;
        if (absIdx >= this._char.inventory.length) return;
        if (ptr.button === 2) {
          this._examineItem(absIdx);
        } else {
          this._selectRow(absIdx);
        }
      });
      bg.on('pointerover', () => { if (!bg.fillAlpha) bg.setFillStyle(0x003300, 0.4); });
      bg.on('pointerout',  () => { if (!bg.fillAlpha) bg.setFillStyle(0x002200, 0); });

      this._rows.push(txt);
      this._rowBgs.push(bg);
    }
    this._rebuildList();
  }

  private _rebuildList(): void {
    const inv  = this._char.inventory;
    const vis  = this._visibleRows();

    for (let i = 0; i < vis; i++) {
      const absIdx = this._scrollOffset + i;
      const bg  = this._rowBgs[i];
      const txt = this._rows[i];

      if (absIdx >= inv.length) {
        txt.setText('');
        bg.setFillStyle(0x002200, 0);
        continue;
      }

      const slot = inv[absIdx];
      const def  = getItem(slot.id);
      const name = def?.name ?? slot.id;
      const qty  = slot.quantity > 1 ? `${slot.quantity}` : '';
      const wt   = def ? `${def.weight * slot.quantity}` : '';
      const val  = def ? `${def.value}` : '';

      // Pad name to fixed width
      const namePad = name.slice(0, 28).padEnd(28);
      const line = `${namePad}${qty.padStart(4)}  ${wt.padStart(3)}  ${val.padStart(4)}`;
      const isEq = slot.id === this._char.equipped.weapon || slot.id === this._char.equipped.armor;

      txt.setText(line);
      txt.setStyle(absIdx === this._selIdx ? STYLE_SEL : isEq ? { ...STYLE_BODY, color: '#88ffff' } : STYLE_BODY);
      bg.setFillStyle(absIdx === this._selIdx ? 0x224400 : 0x002200, absIdx === this._selIdx ? 0.6 : 0);
    }
  }

  // ── Detail pane ───────────────────────────────────────────────────────────

  private _buildDetailPane(): void {
    this._clearDetail();
    if (this._selIdx < 0 || this._selIdx >= this._char.inventory.length) {
      const hint = this.add.text(DETAIL_X, DETAIL_Y, 'Select an item\nto see details.', STYLE_DIM).setDepth(2);
      this._detailGroup.push(hint);
      return;
    }

    const slot = this._char.inventory[this._selIdx];
    const def  = getItem(slot.id);
    if (!def) return;

    let dy = DETAIL_Y;

    // Name
    const nameText = this.add.text(DETAIL_X, dy, def.name, { ...STYLE_HEADER, fontSize: '12px' }).setDepth(2);
    this._detailGroup.push(nameText);
    dy += 18;

    // Type tag
    const typeText = this.add.text(DETAIL_X, dy, `[${def.type.toUpperCase()}]`, STYLE_DIM).setDepth(2);
    this._detailGroup.push(typeText);
    dy += 16;

    // Description
    const descText = this.add.text(DETAIL_X, dy, def.description, STYLE_DETAIL).setDepth(2);
    this._detailGroup.push(descText);
    dy += descText.height + 10;

    // Stats line
    const statLines: string[] = [];
    if (def.weight > 0) statLines.push(`Wt: ${def.weight} lbs`);
    statLines.push(`Value: ${def.value} caps`);
    if (def.dmgMin !== undefined) statLines.push(`Dmg: ${def.dmgMin}–${def.dmgMax}`);
    if (def.ac !== undefined)     statLines.push(`AC: +${def.ac}`);
    if (def.dr !== undefined)     statLines.push(`DR: ${def.dr}%`);
    if (def.healAmount !== undefined) statLines.push(`Heals: ${def.healAmount} HP`);
    if (def.skill)                statLines.push(`Skill: ${def.skill}`);

    const statsText = this.add.text(DETAIL_X, dy, statLines.join('\n'), STYLE_BODY).setDepth(2);
    this._detailGroup.push(statsText);
    dy += statsText.height + 14;

    // Quantity
    if (slot.quantity > 1) {
      const qText = this.add.text(DETAIL_X, dy, `Qty in inv: ${slot.quantity}`, STYLE_DIM).setDepth(2);
      this._detailGroup.push(qText);
      dy += 14;
    }

    dy += 6;

    // Action buttons
    const buttons: { label: string; color: number; cb: () => void }[] = [];

    if (def.type === 'consumable') {
      buttons.push({ label: 'USE', color: 0x224422, cb: () => this._doUse() });
    }
    if (def.type === 'armor' || def.type === 'weapon') {
      const isEq = this._char.equipped.armor === slot.id || this._char.equipped.weapon === slot.id;
      buttons.push({
        label: isEq ? 'UNEQUIP' : 'EQUIP',
        color: 0x222244,
        cb:    () => this._doEquip(),
      });
    }
    buttons.push({ label: 'DROP', color: 0x442222, cb: () => this._doDrop() });

    for (const btn of buttons) {
      const bw = 70; const bh = 20;
      const bg = this.add.rectangle(DETAIL_X + bw / 2, dy + bh / 2, bw, bh, btn.color, 1)
        .setDepth(2)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(1, 0x448844);
      const lbl = this.add.text(DETAIL_X + bw / 2, dy + bh / 2, btn.label, { ...STYLE_BODY, color: '#aaffaa' })
        .setOrigin(0.5).setDepth(3);

      bg.on('pointerdown', btn.cb);
      bg.on('pointerover', () => bg.setFillStyle(BTN_OVER, 1));
      bg.on('pointerout',  () => bg.setFillStyle(btn.color, 1));

      this._detailGroup.push(bg, lbl);
      dy += bh + 6;
    }
  }

  private _clearDetail(): void {
    for (const o of this._detailGroup) (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
    this._detailGroup = [];
  }

  // ── Footer (equipped items) ────────────────────────────────────────────────

  private _buildFooter(): void {
    this._equipText = this.add.text(OX + 10, OY + H - 40, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#88cc88',
    }).setDepth(2);

    const hint = this.add.text(OX + PANEL_W - 10, OY + H - 40, '[I] or [Esc] Close', {
      fontFamily: 'monospace', fontSize: '11px', color: DIM_COL, align: 'right',
    }).setOrigin(1, 0).setDepth(2);
    void hint;

    this._updateFooter();
  }

  private _updateFooter(): void {
    const eq = this._char.equipped;
    const wName = eq.weapon ? (getItem(eq.weapon)?.name ?? eq.weapon) : 'None';
    const aName = eq.armor  ? (getItem(eq.armor)?.name  ?? eq.armor)  : 'None';
    this._equipText.setText(`Weapon: ${wName}   Armor: ${aName}`);
  }

  private _updateWeight(): void {
    const cur = totalWeight(this._char);
    const max = maxCarryWeight(this._char);
    const col = cur > max ? '#ff4444' : '#88cc88';
    this._weightText.setText(`Weight: ${cur}/${max} lbs`);
    this._weightText.setColor(col);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private _selectRow(idx: number): void {
    this._selIdx = idx;
    this._clearDetail();
    this._buildDetailPane();
    this._rebuildList();
  }

  private _doUse(): void {
    if (this._selIdx < 0 || this._selIdx >= this._char.inventory.length) return;
    const slot   = this._char.inventory[this._selIdx];
    const result = useItem(this._char, slot.id);
    this._showToast(result.message, result.ok ? '#44ff44' : '#ff4444');

    // Clamp selection
    if (this._selIdx >= this._char.inventory.length) this._selIdx = this._char.inventory.length - 1;
    this._refreshAll();
  }

  private _doEquip(): void {
    if (this._selIdx < 0 || this._selIdx >= this._char.inventory.length) return;
    const slot   = this._char.inventory[this._selIdx];
    const def    = getItem(slot.id);
    if (!def) return;

    // Toggle equip/unequip
    const equip = def.type === 'armor' ? this._char.equipped.armor : this._char.equipped.weapon;
    if (equip === slot.id) {
      const eSlot = def.type === 'armor' ? 'armor' : 'weapon';
      this._char.equipped[eSlot] = null;
      this._showToast(`Unequipped ${def.name}.`, '#ffcc44');
    } else {
      const result = equipItem(this._char, slot.id);
      this._showToast(result.message, result.ok ? '#44ff44' : '#ff4444');
    }
    this._refreshAll();
  }

  private _doDrop(): void {
    if (this._selIdx < 0 || this._selIdx >= this._char.inventory.length) return;
    const slot   = this._char.inventory[this._selIdx];
    const { result, def } = dropItem(this._char, slot.id);

    if (result.ok && def) {
      // Signal to LocationScene to spawn a GroundItem
      this.registry.set('pendingDrop', { itemId: slot.id, qty: 1 });
    }
    this._showToast(result.message, result.ok ? '#ffcc44' : '#ff4444');

    if (this._selIdx >= this._char.inventory.length) this._selIdx = this._char.inventory.length - 1;
    this._refreshAll();
  }

  private _examineItem(idx: number): void {
    const slot = this._char.inventory[idx];
    const def  = getItem(slot.id);
    if (!def) return;

    // Clear existing popup
    for (const o of this._examineGroup) (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
    this._examineGroup = [];

    const px = 200; const py = 150; const pw = 400; const ph = 120;
    const bg = this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, 0x001100, 0.98)
      .setDepth(10).setStrokeStyle(1, 0x44aa44);
    const title = this.add.text(px + 10, py + 10, def.name, { ...STYLE_HEADER, fontSize: '12px' }).setDepth(11);
    const desc  = this.add.text(px + 10, py + 30, def.description, {
      ...STYLE_BODY, wordWrap: { width: pw - 20 },
    }).setDepth(11);
    const hint  = this.add.text(px + pw - 10, py + ph - 14, '[Click to close]', STYLE_DIM)
      .setOrigin(1, 0).setDepth(11);

    this._examineGroup.push(bg, title, desc, hint);
    bg.setInteractive();
    bg.on('pointerdown', () => {
      for (const o of this._examineGroup) (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
      this._examineGroup = [];
    });
  }

  // ── Toast notification ────────────────────────────────────────────────────

  private _showToast(message: string, color = '#c8e8c8'): void {
    const toast = this.add.text(400, OY + H - 20, message, {
      fontFamily: 'monospace', fontSize: '12px',
      color, backgroundColor: '#00110088',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets:  toast,
      alpha:    { from: 0, to: 1 },
      duration: 150,
      yoyo:     true,
      hold:     1400,
      onComplete: () => toast.destroy(),
    });
  }

  // ── Refresh helpers ────────────────────────────────────────────────────────

  private _refreshAll(): void {
    this._rebuildList();
    this._clearDetail();
    this._buildDetailPane();
    this._updateWeight();
    this._updateFooter();
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(): void {
    if (
      Phaser.Input.Keyboard.JustDown(this._keyI) ||
      Phaser.Input.Keyboard.JustDown(this._keyEsc)
    ) {
      this._cleanup();
      this.scene.stop();
    }
  }

  private _cleanup(): void {
    this._clearDetail();
    for (const o of this._examineGroup) (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
    this._examineGroup = [];
  }
}
