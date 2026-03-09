/**
 * QuestLogScene.ts — PipBoy-style quest log overlay.
 *
 * Launched by LocationScene on [Q] key press.
 * Shows active quests with stage progress, and completed quests.
 * [Q] or [ESC] to close.
 */

import Phaser from 'phaser';
import type { CharacterData, Quest } from '../utils/types';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

// ── Colours ───────────────────────────────────────────────────────────────────
const AMB    = '#c8a000';
const AMB_HI = '#ffd700';
const AMB_LO = '#7a6000';
const GREEN  = '#44cc44';
const RED    = '#cc4444';
const MONO   = 'monospace';

const PANEL_X = 40;
const PANEL_Y = 40;
const PANEL_W = GAME_WIDTH  - 80;
const PANEL_H = GAME_HEIGHT - 80;
const LIST_X  = PANEL_X + 16;
const LIST_TOP = PANEL_Y + 70;
const DETAIL_X = PANEL_X + 320;
const DETAIL_Y = PANEL_Y + 70;

export class QuestLogScene extends Phaser.Scene {

  private _charData!: CharacterData;
  private _quests:    Quest[] = [];
  private _selectedIdx = 0;

  // List item refs for highlight
  private _listItems: Array<{
    bg:    Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    status:Phaser.GameObjects.Text;
    quest: Quest;
  }> = [];

  // Detail pane refs
  private _detailGroup: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'QuestLogScene' });
  }

  create(): void {
    this._charData = this.registry.get('characterData') as CharacterData;
    this._quests   = this._charData?.quests ?? [];

    this._drawPanel();
    this._buildList();
    this._buildKeyHints();

    // Select first active quest by default
    const firstActive = this._quests.findIndex(q => q.status === 'active');
    if (firstActive >= 0) this._selectItem(firstActive);
    else if (this._quests.length > 0) this._selectItem(0);

    // Input
    const kb = this.input.keyboard!;
    kb.on('keydown-ESCAPE', () => this._close());
    kb.on('keydown-Q',      () => this._close());
    kb.on('keydown-UP',     () => this._moveSelection(-1));
    kb.on('keydown-DOWN',   () => this._moveSelection(1));

    // Prevent input bleeding to underlying scene
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => p.event.stopPropagation());
  }

  // ── Panel background ─────────────────────────────────────────────────────────

  private _drawPanel(): void {
    const g = this.add.graphics();

    // Dark overlay
    g.fillStyle(0x000000, 0.7);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Main panel
    g.fillStyle(0x0a0900, 0.97);
    g.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    g.lineStyle(1, 0x5a4800);
    g.strokeRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);

    // List / detail divider
    g.lineStyle(1, 0x3a3010);
    g.lineBetween(DETAIL_X - 16, PANEL_Y + 52, DETAIL_X - 16, PANEL_Y + PANEL_H - 4);

    // Header separator
    g.lineBetween(PANEL_X, PANEL_Y + 52, PANEL_X + PANEL_W, PANEL_Y + 52);

    // Title
    this.add.text(PANEL_X + PANEL_W / 2, PANEL_Y + 14, 'PIP-BOY 3000 — QUEST LOG', {
      fontFamily: MONO, fontSize: '16px', color: AMB_HI, fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Column headers
    this.add.text(LIST_X, PANEL_Y + 56, 'STATUS', {
      fontFamily: MONO, fontSize: '9px', color: AMB_LO,
    });
    this.add.text(LIST_X + 68, PANEL_Y + 56, 'QUEST NAME', {
      fontFamily: MONO, fontSize: '9px', color: AMB_LO,
    });

    // Close hint
    this.add.text(PANEL_X + PANEL_W - 8, PANEL_Y + 14, '[Q] or [ESC] to close', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    }).setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._close());
  }

  // ── Quest list ────────────────────────────────────────────────────────────────

  private _buildList(): void {
    this._listItems = [];

    if (this._quests.length === 0) {
      this.add.text(LIST_X, LIST_TOP + 20, 'No quests yet.', {
        fontFamily: MONO, fontSize: '12px', color: AMB_LO,
      });
      return;
    }

    // Sort: active first, then completed, then failed
    const sorted = [...this._quests].sort((a, b) => {
      const order: Record<Quest['status'], number> = {
        active: 0, inactive: 1, completed: 2, failed: 3,
      };
      return order[a.status] - order[b.status];
    });

    sorted.forEach((quest, idx) => {
      const y = LIST_TOP + idx * 36;

      const bg = this.add.rectangle(
        LIST_X + 140, y + 14,
        280, 30,
        0x1a1700, 0,
      ).setInteractive({ useHandCursor: true });

      const statusColor = quest.status === 'active'    ? GREEN
                        : quest.status === 'completed' ? AMB_LO
                        : RED;
      const statusLabel = quest.status === 'active'    ? '● ACTIVE'
                        : quest.status === 'completed' ? '✓ DONE'
                        : '✗ FAILED';

      const statusTxt = this.add.text(LIST_X, y + 14, statusLabel, {
        fontFamily: MONO, fontSize: '10px', color: statusColor,
      }).setOrigin(0, 0.5);

      const titleTxt = this.add.text(LIST_X + 68, y + 14, quest.name, {
        fontFamily: MONO, fontSize: '11px', color: AMB,
      }).setOrigin(0, 0.5);

      bg.on('pointerdown', () => this._selectItem(idx));
      bg.on('pointerover', () => {
        if (this._selectedIdx !== idx) bg.setFillStyle(0x1a1700, 0.5);
      });
      bg.on('pointerout', () => {
        if (this._selectedIdx !== idx) bg.setFillStyle(0x1a1700, 0);
      });

      this._listItems.push({ bg, title: titleTxt, status: statusTxt, quest });
    });
  }

  private _selectItem(idx: number): void {
    // Deselect old
    const old = this._listItems[this._selectedIdx];
    if (old) {
      old.bg.setFillStyle(0x1a1700, 0);
      old.title.setColor(AMB);
    }

    this._selectedIdx = idx;
    const item = this._listItems[idx];
    if (!item) return;
    item.bg.setFillStyle(0x2a2400, 0.9);
    item.title.setColor(AMB_HI);

    this._renderDetail(item.quest);
  }

  private _moveSelection(dir: number): void {
    const next = Phaser.Math.Clamp(
      this._selectedIdx + dir, 0, this._listItems.length - 1,
    );
    this._selectItem(next);
  }

  // ── Detail pane ───────────────────────────────────────────────────────────────

  private _renderDetail(quest: Quest): void {
    // Destroy old detail objects
    for (const obj of this._detailGroup) {
      (obj as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
    }
    this._detailGroup = [];

    let y = DETAIL_Y;

    const push = (obj: Phaser.GameObjects.GameObject) => {
      this._detailGroup.push(obj);
      return obj;
    };

    push(this.add.text(DETAIL_X, y, quest.name.toUpperCase(), {
      fontFamily: MONO, fontSize: '14px', color: AMB_HI, fontStyle: 'bold',
      wordWrap: { width: PANEL_W - (DETAIL_X - PANEL_X) - 20 },
    }));
    y += 34;

    // Status badge
    const statusColor = quest.status === 'active'    ? GREEN
                      : quest.status === 'completed' ? AMB_LO
                      : RED;
    const statusLabel = quest.status === 'active'    ? '[ ACTIVE ]'
                      : quest.status === 'completed' ? '[ COMPLETED ]'
                      : quest.status === 'failed'    ? '[ FAILED ]'
                      : '[ INACTIVE ]';
    push(this.add.text(DETAIL_X, y, statusLabel, {
      fontFamily: MONO, fontSize: '11px', color: statusColor,
    }));

    if (quest.time_limit_days !== undefined && quest.status === 'active') {
      const days   = this._charData.days ?? 0;
      const remain = quest.time_limit_days - days;
      const col    = remain < 30 ? RED : remain < 60 ? '#ffaa00' : AMB_LO;
      push(this.add.text(DETAIL_X + 120, y, `Time left: ${remain} days`, {
        fontFamily: MONO, fontSize: '11px', color: col,
      }));
    }
    y += 24;

    // Description
    push(this.add.text(DETAIL_X, y, quest.description, {
      fontFamily: MONO, fontSize: '11px', color: AMB,
      wordWrap: { width: PANEL_W - (DETAIL_X - PANEL_X) - 20 },
    }));
    y += 70;

    // Stages
    push(this.add.text(DETAIL_X, y, 'OBJECTIVES', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    }));
    y += 18;

    const g = this.add.graphics();
    push(g);
    g.lineStyle(1, 0x3a3010);
    g.lineBetween(DETAIL_X, y, PANEL_X + PANEL_W - 20, y);
    y += 8;

    for (const stage of quest.stages) {
      const tick  = stage.completed ? '✓' : '○';
      const color = stage.completed ? AMB_LO : AMB;
      const txt = push(this.add.text(DETAIL_X, y, `${tick}  ${stage.description}`, {
        fontFamily: MONO, fontSize: '11px', color,
        wordWrap: { width: PANEL_W - (DETAIL_X - PANEL_X) - 20 },
      })) as Phaser.GameObjects.Text;
      if (stage.completed) {
        txt.setAlpha(0.55);
      }
      y += txt.height + 10;
    }

    // XP reward
    y += 10;
    push(this.add.text(DETAIL_X, y, `XP Reward: ${quest.xp_reward}`, {
      fontFamily: MONO, fontSize: '11px', color: '#88ccff',
    }));
  }

  // ── Key hints ─────────────────────────────────────────────────────────────────

  private _buildKeyHints(): void {
    this.add.text(PANEL_X + 8, PANEL_Y + PANEL_H - 24, '↑/↓ Navigate', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    });
  }

  // ── Close ─────────────────────────────────────────────────────────────────────

  private _close(): void {
    this.scene.stop();
  }
}
