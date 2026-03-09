/**
 * CombatScene.ts — Combat HUD overlay scene.
 *
 * Launched on top of LocationScene when combat starts via:
 *   this.scene.launch('CombatScene')
 *
 * Closed automatically when LocationScene calls
 *   this.scene.stop('CombatScene')
 *
 * Layout (bottom strip, 800 × 160 px at y = 440)
 * ───────────────────────────────────────────────
 * ┌──────────────┬─────────────────────────────┬─────────────┐
 * │ ⚔ COMBAT     │  [log line 1]               │ [END TURN]  │
 * │ AP ■■■■□□□□  │  [log line 2]               │             │
 * │ 4 / 8        │  [log line 3]               │  [ FLEE ]   │
 * │              │  [log line 4]               │             │
 * │              │  [log line 5]               │             │
 * └──────────────┴─────────────────────────────┴─────────────┘
 *
 * Communication with LocationScene
 * ──────────────────────────────────
 * Read-only:
 *   registry 'combatState' = { playerAP, playerMaxAP, log: string[], enemyTurn: bool }
 *
 * Write (game-level events):
 *   this.game.events.emit('combat:endTurn')
 *   this.game.events.emit('combat:flee')
 */

import Phaser from 'phaser';

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_H  = 160;
const PANEL_Y  = 600 - PANEL_H;   // 440
const COL1_X   = 10;              // status / AP column
const COL1_W   = 190;
const COL2_X   = COL1_W + 20;    // log column
const COL2_W   = 480;
const COL3_X   = COL2_X + COL2_W + 10;  // buttons column
const LOG_LINES = 5;

// ── Styles ────────────────────────────────────────────────────────────────────
const S_TITLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '13px', color: '#ff6644',
};
const S_AP: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '16px', color: '#ffcc44',
  letterSpacing: 2,
};
const S_APNUM: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: '#c8c8c8',
};
const S_LOG: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: '#c8e8c8',
};
const S_LOG_OLD: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: '#607060',
};
const S_ENEMY_TURN: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace', fontSize: '11px', color: '#ff8844',
};
const BTN_COLOR = 0x223322;
const BTN_HOVER = 0x446644;

// ── Scene ─────────────────────────────────────────────────────────────────────

export class CombatScene extends Phaser.Scene {

  private _apText!:       Phaser.GameObjects.Text;
  private _apNumText!:    Phaser.GameObjects.Text;
  private _logTexts:      Phaser.GameObjects.Text[] = [];
  private _statusText!:   Phaser.GameObjects.Text;
  private _endTurnBtn!:       Phaser.GameObjects.Rectangle;
  private _fleeBtn!:          Phaser.GameObjects.Rectangle;
  private _enemyTurnOverlay!: Phaser.GameObjects.Text;

  private _enemyTurn = false;

  constructor() {
    super({ key: 'CombatScene' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  create(): void {
    this._buildPanel();
    this._buildStatusColumn();
    this._buildLogColumn();
    this._buildButtonColumn();
    this._buildEnemyTurnOverlay();

    // Listen for updates from LocationScene
    this.game.events.on('combat:update', this._onUpdate, this);

    // Initial render
    const state = this._getState();
    this._renderState(state);
  }

  // ── Panel background ──────────────────────────────────────────────────────

  private _buildPanel(): void {
    // Full-width semi-transparent bar
    this.add.rectangle(400, PANEL_Y + PANEL_H / 2, 800, PANEL_H, 0x001100, 0.93)
      .setDepth(1000);

    // Top border line
    this.add.line(0, 0, 0, PANEL_Y, 800, PANEL_Y, 0x448844)
      .setOrigin(0).setDepth(1001);

    // Column separators
    this.add.line(0, 0, COL2_X - 5, PANEL_Y + 5, COL2_X - 5, 600, 0x336633)
      .setOrigin(0).setDepth(1001);
    this.add.line(0, 0, COL3_X - 5, PANEL_Y + 5, COL3_X - 5, 600, 0x336633)
      .setOrigin(0).setDepth(1001);
  }

  // ── Status / AP column ────────────────────────────────────────────────────

  private _buildStatusColumn(): void {
    const y0 = PANEL_Y + 8;

    this.add.text(COL1_X, y0, '⚔ COMBAT', S_TITLE).setDepth(1002);

    this._statusText = this.add.text(COL1_X, y0 + 18, 'Your turn', S_ENEMY_TURN)
      .setDepth(1002);

    this._apText = this.add.text(COL1_X, y0 + 36, '', S_AP).setDepth(1002);

    this._apNumText = this.add.text(COL1_X, y0 + 60, '', S_APNUM).setDepth(1002);
  }

  // ── Log column ────────────────────────────────────────────────────────────

  private _buildLogColumn(): void {
    const lineH = (PANEL_H - 16) / LOG_LINES;
    for (let i = 0; i < LOG_LINES; i++) {
      const txt = this.add.text(
        COL2_X, PANEL_Y + 8 + i * lineH, '', S_LOG,
      ).setDepth(1002);
      this._logTexts.push(txt);
    }
  }

  // ── Buttons column ────────────────────────────────────────────────────────

  private _buildButtonColumn(): void {
    const bw = 110; const bh = 32;
    const bx = COL3_X + bw / 2 + 5;

    // End Turn
    this._endTurnBtn = this.add.rectangle(bx, PANEL_Y + 40, bw, bh, BTN_COLOR, 1)
      .setDepth(1002).setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x448844);
    this.add.text(bx, PANEL_Y + 40, 'END TURN', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaffaa',
    }).setOrigin(0.5).setDepth(1003);

    this._endTurnBtn.on('pointerover', () => this._endTurnBtn.setFillStyle(BTN_HOVER, 1));
    this._endTurnBtn.on('pointerout',  () => this._endTurnBtn.setFillStyle(BTN_COLOR, 1));
    this._endTurnBtn.on('pointerdown', () => {
      if (!this._enemyTurn) this.game.events.emit('combat:endTurn');
    });

    // Flee
    this._fleeBtn = this.add.rectangle(bx, PANEL_Y + 100, bw, bh, 0x332200, 1)
      .setDepth(1002).setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x886644);
    this.add.text(bx, PANEL_Y + 100, 'FLEE', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffcc88',
    }).setOrigin(0.5).setDepth(1003);

    this._fleeBtn.on('pointerover', () => this._fleeBtn.setFillStyle(0x553300, 1));
    this._fleeBtn.on('pointerout',  () => this._fleeBtn.setFillStyle(0x332200, 1));
    this._fleeBtn.on('pointerdown', () => this.game.events.emit('combat:flee'));
  }

  // ── Enemy-turn dimmer ─────────────────────────────────────────────────────

  private _buildEnemyTurnOverlay(): void {
    this._enemyTurnOverlay = this.add.text(400, PANEL_Y - 28, 'ENEMY TURN…', {
      fontFamily:      'monospace',
      fontSize:        '14px',
      color:           '#ff8844',
      backgroundColor: '#00110099',
      padding:         { x: 14, y: 6 },
    }).setOrigin(0.5).setDepth(1004).setAlpha(0);
  }

  // ── State helpers ─────────────────────────────────────────────────────────

  private _getState(): { playerAP: number; playerMaxAP: number; log: string[]; enemyTurn: boolean } {
    const raw = this.registry.get('combatState') as {
      playerAP: number; playerMaxAP: number; log: string[]; enemyTurn: boolean;
    } | null;
    return raw ?? { playerAP: 0, playerMaxAP: 0, log: [], enemyTurn: false };
  }

  private _onUpdate(): void {
    const state = this._getState();
    this._renderState(state);
  }

  private _renderState(state: { playerAP: number; playerMaxAP: number; log: string[]; enemyTurn: boolean }): void {
    const { playerAP, playerMaxAP, log, enemyTurn } = state;

    // AP blocks: ■ = used, □ = remaining
    const filled = playerAP;
    const empty  = playerMaxAP - playerAP;
    this._apText.setText('■'.repeat(filled) + '□'.repeat(empty));
    this._apNumText.setText(`${playerAP} / ${playerMaxAP}  AP`);

    // Log — most recent at bottom (log index -1 = newest)
    const visible = log.slice(-LOG_LINES);
    for (let i = 0; i < LOG_LINES; i++) {
      const txt    = this._logTexts[i];
      const entry  = visible[i] ?? '';
      const isNew  = i === visible.length - 1 && entry !== '';
      txt.setText(entry);
      txt.setStyle(isNew ? S_LOG : S_LOG_OLD);
    }

    // Enemy-turn indicator
    if (enemyTurn !== this._enemyTurn) {
      this._enemyTurn = enemyTurn;
      this._enemyTurnOverlay.setAlpha(enemyTurn ? 1 : 0);
      this._statusText.setText(enemyTurn ? 'Enemy turn…' : 'Your turn');
      this._endTurnBtn.setAlpha(enemyTurn ? 0.4 : 1);
    }

  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shutdown(): void {
    this.game.events.off('combat:update', this._onUpdate, this);
  }
}
