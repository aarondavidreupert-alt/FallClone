/**
 * DialogueScene.ts — Fallout 1-style dialogue overlay.
 *
 * Launched on top of LocationScene via this.scene.launch().
 * LocationScene is paused while this scene is active and resumed on close.
 *
 * Panel layout (800 × 600 canvas)
 * ────────────────────────────────
 *
 *  ┌─ panel (x=15, y=145, w=770, h=440) ──────────────────────────────── [X] ┐
 *  │                                                                           │
 *  │  ┌─portrait─┐   NPC NAME                                                │
 *  │  │  (110×  │   ─────────────────────────────────────────────────────   │
 *  │  │   130)  │   "NPC speech text shown here, word-wrapped across the    │
 *  │  │         │    full width of the right column."                       │
 *  │  └─────────┘                                                            │
 *  ├──────────────────────────────────────────────────────────────────────────┤
 *  │  1   Response option one                                                │
 *  │  2   Response option two                                                │
 *  │  3   Response option three                                              │
 *  │  ...                                                                    │
 *  └────────────────────────────────────────────────────────────────────────┘
 *
 * Keyboard shortcuts 1–9 select the corresponding response.
 * Escape or the [X] button closes the dialogue.
 *
 * Input data (passed via this.scene.launch)
 * ──────────────────────────────────────────
 *   npcId:      string   — looks up dialogue file in DIALOGUE_REGISTRY
 *   npcName:    string   — displayed as the NPC's name above the speech text
 */

import Phaser from 'phaser';
import { DialogueSystem } from '../systems/DialogueSystem';
import type { DialogueFile, DialogueNode } from '../utils/types';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

// ── Statically imported dialogue files ──────────────────────────────────────
// Vite bundles JSON imports automatically. Add new NPCs here as the game grows.
import overseerData from '../data/dialogue/overseer.json';

const DIALOGUE_REGISTRY: Record<string, DialogueFile> = {
  overseer: overseerData as DialogueFile,
};

// ── Layout constants ──────────────────────────────────────────────────────────
const PX         = 15;   // panel x
const PY         = 145;  // panel y
const PW         = GAME_WIDTH  - PX * 2;   // 770
const PH         = GAME_HEIGHT - PY - 15;  // 440

const PORT_X     = PX + 10;          // portrait left
const PORT_Y     = PY + 13;          // portrait top
const PORT_W     = 110;
const PORT_H     = 130;

const TEXT_X     = PORT_X + PORT_W + 15;   // speech text left
const TEXT_W     = PW - PORT_W - 30;       // speech text width (≈ 625px)

const SEP_Y      = PY + PORT_H + 26;       // horizontal separator y

const RESP_X     = PX + 14;               // response list left
const RESP_Y0    = SEP_Y + 20;            // first response y
const RESP_STEP  = 34;                    // pixels per response row

// ── Colours ───────────────────────────────────────────────────────────────────
const AMB    = '#c8a000';
const AMB_HI = '#ffd700';
const AMB_LO = '#7a6000';
const MONO   = 'monospace';

// ─────────────────────────────────────────────────────────────────────────────

interface InitData {
  npcId:   string;
  npcName: string;
}

export class DialogueScene extends Phaser.Scene {

  private _sys!:        DialogueSystem;
  private _npcName = '';
  private _npcId   = '';

  // Live-update refs
  private _speechText!: Phaser.GameObjects.Text;
  private _respGroup:   Phaser.GameObjects.Text[] = [];
  private _respContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'DialogueScene' });
  }

  init(data: InitData): void {
    const file = DIALOGUE_REGISTRY[data.npcId];
    if (!file) throw new Error(`DialogueScene: no dialogue for npc "${data.npcId}"`);
    this._sys     = new DialogueSystem(file);
    this._npcName = data.npcName;
    this._npcId   = data.npcId;
  }

  create(): void {
    // Pause the map scene so input/movement stops during conversation.
    this.scene.pause('LocationScene');

    this._drawPanel();
    this._buildPortrait();
    this._buildCloseButton();

    // NPC name heading
    this.add.text(TEXT_X, PORT_Y + 2, this._npcName.toUpperCase(), {
      fontFamily: MONO, fontSize: '14px', color: AMB_HI, fontStyle: 'bold',
    });

    // Speech text object (word-wrapped, reused across nodes)
    this._speechText = this.add.text(TEXT_X, PORT_Y + 22, '', {
      fontFamily:  MONO,
      fontSize:    '13px',
      color:       AMB,
      wordWrap:    { width: TEXT_W },
    });

    // Response container (rebuilt on each node)
    this._respContainer = this.add.container(0, 0);

    // Keyboard shortcuts
    this.input.keyboard!.on('keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') { this._close(); return; }
      const n = parseInt(evt.key, 10);
      if (!isNaN(n) && n >= 1) this._selectResponse(n - 1);
    });

    // Show the first node
    this._showNode(this._sys.start());
  }

  // ── Panel drawing ─────────────────────────────────────────────────────────

  private _drawPanel(): void {
    const g = this.add.graphics();

    // Full-screen dim overlay
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Main panel background
    g.fillStyle(0x0d0a00);
    g.fillRect(PX, PY, PW, PH);

    // Panel border
    g.lineStyle(2, 0x5a4400, 1);
    g.strokeRect(PX, PY, PW, PH);

    // Inner top strip (slightly lighter — header band)
    g.fillStyle(0x1a1200);
    g.fillRect(PX + 1, PY + 1, PW - 2, PORT_H + 24);

    // Portrait frame
    g.lineStyle(1, 0x4a3800, 1);
    g.strokeRect(PORT_X, PORT_Y, PORT_W, PORT_H);

    // Separator line between speech and responses
    g.lineStyle(1, 0x3a2800, 1);
    g.lineBetween(PX + 6, SEP_Y, PX + PW - 6, SEP_Y);

    // Response area background
    g.fillStyle(0x000000, 0.3);
    g.fillRect(PX + 1, SEP_Y + 1, PW - 2, PH - (SEP_Y - PY) - 2);
  }

  // ── Portrait (programmatic placeholder) ──────────────────────────────────

  private _buildPortrait(): void {
    const g = this.add.graphics();
    const cx = PORT_X + PORT_W / 2;  // 70
    const cy = PORT_Y;

    // Portrait background fill (already drawn in panel, just add detail)
    g.fillStyle(0x100c00);
    g.fillRect(PORT_X + 1, PORT_Y + 1, PORT_W - 2, PORT_H - 2);

    // Vault-suit body block
    g.fillStyle(0x1a2040);
    g.fillRect(cx - 30, cy + 68, 60, PORT_H - 72);

    // Vault collar
    g.fillStyle(0x2a3050);
    g.fillRect(cx - 14, cy + 62, 28, 16);

    // Head silhouette (circle)
    g.fillStyle(0x7a5030);
    g.fillCircle(cx, cy + 42, 28);

    // Left-side shadow on head
    g.fillStyle(0x4a3020, 0.6);
    g.fillTriangle(
      cx,        cy + 16,   // top of head
      cx,        cy + 68,   // chin
      cx - 26,   cy + 42,   // left of head
    );

    // Eyes
    g.fillStyle(0x0d0a00);
    g.fillRect(cx - 18, cy + 36, 10, 6);
    g.fillRect(cx +  8, cy + 36, 10, 6);

    // Eye glint (pupils)
    g.fillStyle(0xc87040, 0.8);
    g.fillRect(cx - 15, cy + 38, 4, 3);
    g.fillRect(cx + 11, cy + 38, 4, 3);

    // Mouth — stern line
    g.lineStyle(1, 0x503820, 1);
    g.lineBetween(cx - 10, cy + 54, cx + 10, cy + 54);

    // Vault 13 badge on chest
    g.fillStyle(0x3a2800);
    g.fillRect(cx - 12, cy + 78, 24, 16);
    g.lineStyle(1, 0x6a4800);
    g.strokeRect(cx - 12, cy + 78, 24, 16);

    // Name strip at bottom of portrait
    g.fillStyle(0x1a1000);
    g.fillRect(PORT_X + 1, PORT_Y + PORT_H - 18, PORT_W - 2, 17);
    g.lineStyle(1, 0x3a2800);
    g.lineBetween(PORT_X + 1, PORT_Y + PORT_H - 18, PORT_X + PORT_W - 1, PORT_Y + PORT_H - 18);

    this.add.text(PORT_X + PORT_W / 2, PORT_Y + PORT_H - 9, 'OVERSEER', {
      fontFamily: MONO, fontSize: '9px', color: AMB_LO,
    }).setOrigin(0.5, 0.5);
  }

  // ── Close button ──────────────────────────────────────────────────────────

  private _buildCloseButton(): void {
    const x = PX + PW - 10;
    const y = PY + 10;

    const btn = this.add.text(x, y, '[X]', {
      fontFamily: MONO, fontSize: '13px', color: AMB_LO,
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => btn.setColor(AMB_HI))
      .on('pointerout',   () => btn.setColor(AMB_LO))
      .on('pointerdown',  () => this._close());
  }

  // ── Node display ──────────────────────────────────────────────────────────

  private _showNode(node: DialogueNode): void {
    // Update NPC speech
    this._speechText.setText(node.text);

    // Rebuild response list
    this._respContainer.removeAll(true);
    this._respGroup = [];

    // "WHAT DO YOU SAY?" header
    const header = this.add.text(RESP_X, SEP_Y + 6, 'WHAT DO YOU SAY?', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    });
    this._respContainer.add(header);

    node.responses.forEach((resp, i) => {
      const y = RESP_Y0 + i * RESP_STEP;

      // Number badge
      const num = this.add.text(RESP_X, y, `${i + 1}`, {
        fontFamily: MONO, fontSize: '13px', color: AMB_LO,
        backgroundColor: '#1a1200',
        padding: { x: 4, y: 2 },
      }).setOrigin(0, 0);

      // Response text (interactive)
      const txt = this.add.text(RESP_X + 26, y, resp.text, {
        fontFamily: MONO, fontSize: '13px', color: AMB,
        wordWrap:   { width: PW - 50 },
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerover',  () => { txt.setColor(AMB_HI); num.setColor(AMB_HI); })
        .on('pointerout',   () => { txt.setColor(AMB);    num.setColor(AMB_LO); })
        .on('pointerdown',  () => this._selectResponse(i));

      this._respContainer.add([num, txt]);
      this._respGroup.push(txt);
    });
  }

  // ── Response selection ────────────────────────────────────────────────────

  private _selectResponse(index: number): void {
    if (index < 0 || index >= (this._sys.currentNode?.responses.length ?? 0)) return;

    const result = this._sys.select(index);
    if (result.isEnd) {
      this._close();
    } else if (result.node) {
      this._showNode(result.node);
    }
  }

  // ── Close ─────────────────────────────────────────────────────────────────

  private _close(): void {
    // Notify LocationScene which NPC conversation just ended
    this.game.events.emit('dialogue:closed', { npcId: this._npcId });
    this.scene.resume('LocationScene');
    this.scene.stop();
  }
}
