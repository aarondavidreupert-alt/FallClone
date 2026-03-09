/**
 * WorldMapScene.ts — World-map travel screen.
 *
 * Accessible from LocationScene via [W] key once the player has left Vault 13
 * (charData.worldUnlocked === true).
 *
 * Layout (800 × 600)
 * ──────────────────
 *  Background: hand-drawn wasteland map (pure Graphics)
 *  Location dots: pulsing circles colour-coded by type
 *  Sidebar (right, x=580): selected location info + travel button
 *  Footer bar: current location, day counter, ESC hint
 *
 * Communication
 * ─────────────
 *  Reads:  registry 'characterData'
 *  Writes: registry 'characterData' (days, worldUnlocked)
 *          registry 'travelTarget' — set before returning to LocationScene
 *  On travel: this.scene.start('LocationScene')
 *             (LocationScene reads 'travelTarget' and shows arrival banner)
 */

import Phaser from 'phaser';
import type { CharacterData } from '../utils/types';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

// ── Location data ─────────────────────────────────────────────────────────────

interface WorldLocation {
  id:          string;
  name:        string;
  x:           number;   // canvas x (0–800)
  y:           number;   // canvas y (0–600)
  travelDays:  number;   // days to travel from Vault 13
  color:       number;   // dot tint
  isHome:      boolean;
  implemented: boolean;  // false = placeholder map
}

const LOCATIONS: WorldLocation[] = [
  { id: 'vault13',      name: 'Vault 13',      x: 370, y: 190, travelDays: 0,  color: 0x4488ff, isHome: true,  implemented: true  },
  { id: 'shady_sands',  name: 'Shady Sands',   x: 480, y: 250, travelDays: 2,  color: 0x44cc44, isHome: false, implemented: false },
  { id: 'vault15',      name: 'Vault 15',       x: 570, y: 155, travelDays: 4,  color: 0x4488ff, isHome: false, implemented: false },
  { id: 'raiders_camp', name: 'Raiders Camp',   x: 500, y: 320, travelDays: 3,  color: 0xcc3333, isHome: false, implemented: false },
  { id: 'the_hub',      name: 'The Hub',        x: 290, y: 400, travelDays: 5,  color: 0xffcc44, isHome: false, implemented: false },
  { id: 'necropolis',   name: 'Necropolis',     x: 210, y: 310, travelDays: 6,  color: 0xaa44aa, isHome: false, implemented: false },
];

// ── Colours ────────────────────────────────────────────────────────────────────
const COL_BG        = 0x0a0a06;
const COL_GROUND    = 0x1e1a0e;
const COL_PANEL     = 0x0d0c06;
const MONO = 'monospace';
const AMB    = '#c8a000';
const AMB_HI = '#ffd700';
const AMB_LO = '#7a6000';

// Sidebar
const SIDE_X  = 580;
const SIDE_Y  = 60;
const SIDE_W  = 210;
const SIDE_H  = 430;

// ── Scene ─────────────────────────────────────────────────────────────────────

export class WorldMapScene extends Phaser.Scene {

  private _charData!:   CharacterData;
  private _selected:    WorldLocation | null = null;
  private _currentLoc:  WorldLocation  = LOCATIONS[0];

  // Travel confirmation overlay objects
  private _confirmGroup: Phaser.GameObjects.GameObject[] = [];

  // Sidebar refs
  private _sideTitle!:  Phaser.GameObjects.Text;
  private _sideDays!:   Phaser.GameObjects.Text;
  private _sideDesc!:   Phaser.GameObjects.Text;
  private _travelBtn!:  Phaser.GameObjects.Rectangle;
  private _travelLbl!:  Phaser.GameObjects.Text;

  // Footer
  private _footerLoc!:  Phaser.GameObjects.Text;
  private _footerDay!:  Phaser.GameObjects.Text;

  // Dot pulsing
  private _dots: Map<string, Phaser.GameObjects.Arc> = new Map();

  constructor() {
    super({ key: 'WorldMapScene' });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  create(): void {
    this._charData = this.registry.get('characterData') as CharacterData;

    this._drawBackground();
    this._drawRoads();
    this._buildSidebar();
    this._buildFooter();
    this._buildLocations();
    this._buildCloseButton();

    // Pulse dots
    this.time.addEvent({
      delay:    900,
      loop:     true,
      callback: this._pulseDots,
      callbackScope: this,
    });

    // Keyboard
    this.input.keyboard!.on('keydown-ESCAPE', () => this._close());
    this.input.keyboard!.on('keydown-W',      () => this._close());

    this._updateFooter();
  }

  // ── Background ───────────────────────────────────────────────────────────────

  private _drawBackground(): void {
    const g = this.add.graphics();

    // Sky / space backdrop
    g.fillStyle(COL_BG);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Wasteland ground — irregular patches
    const patches: Array<[number, number, number, number]> = [
      [20,  60, 560, 520],
      [40,  80, 520, 480],
      [80, 100, 460, 420],
    ];
    for (const [x, y, w, h] of patches) {
      g.fillStyle(COL_GROUND);
      g.fillRect(x, y, w, h);
    }

    // Subtle texture — sparse dots
    g.fillStyle(0x2a2510);
    for (let i = 0; i < 280; i++) {
      const px = 30  + Math.floor(Math.sin(i * 1.7) * 350 + 280);
      const py = 100 + Math.floor(Math.cos(i * 2.3) * 200 + 180);
      g.fillRect(px, py, 2, 2);
    }

    // Mountains NE (decorative)
    g.fillStyle(0x2a2018);
    const mtns: Array<[number, number, number]> = [
      [490, 130, 40], [520, 120, 30], [550, 135, 35],
      [575, 110, 45], [610, 125, 30], [640, 118, 38],
    ];
    for (const [mx, my, mw] of mtns) {
      g.fillTriangle(mx, my + mw, mx + mw, my + mw, mx + mw / 2, my);
    }

    // River-like line going south
    g.lineStyle(2, 0x1a3050, 0.7);
    g.beginPath();
    g.moveTo(160, 80);
    g.lineTo(180, 160);
    g.lineTo(170, 260);
    g.lineTo(190, 350);
    g.lineTo(200, 440);
    g.strokePath();

    // Sidebar panel
    g.fillStyle(COL_PANEL);
    g.fillRect(SIDE_X - 8, SIDE_Y - 8, SIDE_W + 16, SIDE_H + 16);
    g.lineStyle(1, 0x4a4020);
    g.strokeRect(SIDE_X - 8, SIDE_Y - 8, SIDE_W + 16, SIDE_H + 16);

    // Footer panel
    g.fillStyle(0x060605);
    g.fillRect(0, GAME_HEIGHT - 50, GAME_WIDTH, 50);
    g.lineStyle(1, 0x3a3010);
    g.lineBetween(0, GAME_HEIGHT - 50, GAME_WIDTH, GAME_HEIGHT - 50);

    // Title banner
    g.fillStyle(0x100e06);
    g.fillRect(0, 0, GAME_WIDTH, 52);
    g.lineStyle(1, 0x4a4020);
    g.lineBetween(0, 52, GAME_WIDTH, 52);
  }

  private _drawRoads(): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x3a3018, 0.6);

    // Draw dashed roads between connected locations
    const roads: Array<[string, string]> = [
      ['vault13', 'shady_sands'],
      ['vault13', 'vault15'],
      ['vault13', 'the_hub'],
      ['shady_sands', 'vault15'],
      ['shady_sands', 'raiders_camp'],
      ['the_hub', 'necropolis'],
    ];

    for (const [a, b] of roads) {
      const la = LOCATIONS.find(l => l.id === a);
      const lb = LOCATIONS.find(l => l.id === b);
      if (!la || !lb) continue;

      // Dashed line — alternate 6px drawn, 4px skip
      const dx = lb.x - la.x;
      const dy = lb.y - la.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.floor(dist / 10);
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        g.lineBetween(
          la.x + dx * t0, la.y + dy * t0,
          la.x + dx * t1, la.y + dy * t1,
        );
      }
    }
  }

  // ── Location dots ─────────────────────────────────────────────────────────────

  private _buildLocations(): void {
    // Map title
    this.add.text(GAME_WIDTH / 2 - 10, 18, 'WORLD MAP', {
      fontFamily: MONO, fontSize: '20px', color: AMB_HI, fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    for (const loc of LOCATIONS) {
      const dot = this.add.circle(loc.x, loc.y, 7, loc.color, 0.9)
        .setInteractive({ useHandCursor: true });

      this._dots.set(loc.id, dot);

      // Label
      this.add.text(loc.x, loc.y - 14, loc.name, {
        fontFamily: MONO, fontSize: '10px', color: '#e8d880',
        backgroundColor: '#00000088', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 1);

      dot.on('pointerover', () => dot.setScale(1.5));
      dot.on('pointerout',  () => { if (this._selected?.id !== loc.id) dot.setScale(1); });
      dot.on('pointerdown', () => this._selectLocation(loc));
    }
  }

  private _pulseDots(): void {
    for (const [id, dot] of this._dots.entries()) {
      if (id === this._currentLoc.id) {
        this.tweens.add({
          targets: dot, alpha: { from: 0.6, to: 1 }, duration: 400,
          yoyo: true, ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  private _buildSidebar(): void {
    const x = SIDE_X;
    const y = SIDE_Y;

    this.add.text(x, y, 'LOCATION', {
      fontFamily: MONO, fontSize: '11px', color: AMB_LO,
    });

    this._sideTitle = this.add.text(x, y + 18, '— Select a location —', {
      fontFamily: MONO, fontSize: '14px', color: AMB_HI,
      wordWrap: { width: SIDE_W },
    });

    this._sideDays = this.add.text(x, y + 44, '', {
      fontFamily: MONO, fontSize: '11px', color: '#88aacc',
    });

    // Separator
    const g = this.add.graphics();
    g.lineStyle(1, 0x3a3010);
    g.lineBetween(x, y + 62, x + SIDE_W, y + 62);

    this._sideDesc = this.add.text(x, y + 70, '', {
      fontFamily: MONO, fontSize: '11px', color: AMB,
      wordWrap: { width: SIDE_W },
    });

    // Travel button
    const btnX = x + SIDE_W / 2;
    const btnY  = y + SIDE_H - 20;
    this._travelBtn = this.add.rectangle(btnX, btnY, SIDE_W, 30, 0x1a1800)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x4a4020)
      .setAlpha(0.4);

    this._travelLbl = this.add.text(btnX, btnY, 'SELECT DESTINATION', {
      fontFamily: MONO, fontSize: '12px', color: AMB_LO,
    }).setOrigin(0.5);

    this._travelBtn.on('pointerover', () => {
      if (this._selected && this._selected.id !== this._currentLoc.id)
        this._travelBtn.setFillStyle(0x2a2800);
    });
    this._travelBtn.on('pointerout',  () => this._travelBtn.setFillStyle(0x1a1800));
    this._travelBtn.on('pointerdown', () => {
      if (this._selected && this._selected.id !== this._currentLoc.id)
        this._showTravelConfirm(this._selected);
    });
  }

  private _selectLocation(loc: WorldLocation): void {
    this._selected = loc;

    // Reset dot scale
    for (const d of this._dots.values()) d.setScale(1);
    this._dots.get(loc.id)?.setScale(1.5);

    this._sideTitle.setText(loc.name.toUpperCase());

    if (loc.id === this._currentLoc.id) {
      this._sideDays.setText('You are here');
      this._sideDesc.setText('Current location.');
      this._travelBtn.setAlpha(0.4);
      this._travelLbl.setColor(AMB_LO).setText('ALREADY HERE');
    } else {
      const days = this._travelDays(loc);
      this._sideDays.setText(`Travel: ~${days} day${days !== 1 ? 's' : ''}`);
      this._sideDesc.setText(this._locDescription(loc));
      this._travelBtn.setAlpha(1);
      this._travelLbl.setColor(AMB_HI).setText('► TRAVEL THERE');
    }
  }

  private _locDescription(loc: WorldLocation): string {
    switch (loc.id) {
      case 'vault13':      return 'Home. The vault that sent you.';
      case 'shady_sands':  return 'A small but hopeful settlement in the wastes. Home to the Khan raiders\' former captives.';
      case 'vault15':      return 'A companion vault to 13. Possibly abandoned — or worse. Your best lead for the water chip.';
      case 'raiders_camp': return 'The Khan raider gang operates from a camp east of Shady Sands. Dangerous.';
      case 'the_hub':      return 'A major trading post. Water merchants here deal in old vault salvage.';
      case 'necropolis':   return 'A ruined city overrun by ghouls.  Rumoured to have an intact vault beneath.';
      default:             return '';
    }
  }

  private _travelDays(loc: WorldLocation): number {
    return loc.travelDays;
  }

  // ── Travel confirm overlay ────────────────────────────────────────────────────

  private _showTravelConfirm(loc: WorldLocation): void {
    this._clearConfirm();
    const days = this._travelDays(loc);

    const overlay = this.add.rectangle(400, 300, 380, 160, 0x0a0900, 0.96)
      .setStrokeStyle(1, 0x5a4800);

    const title = this.add.text(400, 240, `Travel to ${loc.name}?`, {
      fontFamily: MONO, fontSize: '15px', color: AMB_HI,
    }).setOrigin(0.5);

    const sub = this.add.text(400, 265, `This will take approximately ${days} day${days !== 1 ? 's' : ''}.`, {
      fontFamily: MONO, fontSize: '12px', color: AMB,
    }).setOrigin(0.5);

    const timelimit = this._charData?.quests.find(q => q.id === 'find_water_chip' && q.status === 'active');
    let warning = '';
    if (timelimit) {
      const remaining = (timelimit.time_limit_days ?? 150) - (this._charData.days ?? 0);
      warning = `Water chip deadline: ${remaining - days} days after arrival.`;
    }
    const warnTxt = this.add.text(400, 288, warning, {
      fontFamily: MONO, fontSize: '10px', color: warning ? '#ff8844' : AMB_LO,
    }).setOrigin(0.5);

    // YES button
    const yesBtn = this.add.rectangle(360, 330, 100, 28, 0x1a1800)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x4a4020);
    const yesLbl = this.add.text(360, 330, 'YES — TRAVEL', {
      fontFamily: MONO, fontSize: '11px', color: '#88ff88',
    }).setOrigin(0.5);
    yesBtn.on('pointerover', () => yesBtn.setFillStyle(0x2a2800));
    yesBtn.on('pointerout',  () => yesBtn.setFillStyle(0x1a1800));
    yesBtn.on('pointerdown', () => this._doTravel(loc));

    // NO button
    const noBtn = this.add.rectangle(460, 330, 80, 28, 0x180a00)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x4a2010);
    const noLbl = this.add.text(460, 330, 'CANCEL', {
      fontFamily: MONO, fontSize: '11px', color: '#ff8844',
    }).setOrigin(0.5);
    noBtn.on('pointerover', () => noBtn.setFillStyle(0x280e00));
    noBtn.on('pointerout',  () => noBtn.setFillStyle(0x180a00));
    noBtn.on('pointerdown', () => this._clearConfirm());

    this._confirmGroup = [overlay, title, sub, warnTxt, yesBtn, yesLbl, noBtn, noLbl];
  }

  private _clearConfirm(): void {
    for (const obj of this._confirmGroup) {
      if ((obj as Phaser.GameObjects.GameObject).scene) {
        (obj as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
      }
    }
    this._confirmGroup = [];
  }

  // ── Travel ────────────────────────────────────────────────────────────────────

  private _doTravel(loc: WorldLocation): void {
    this._clearConfirm();

    // Advance days
    const days = this._travelDays(loc);
    if (this._charData) {
      this._charData.days = (this._charData.days ?? 0) + days;
      this._currentLoc = loc;
      this.registry.set('characterData', this._charData);
      this.registry.set('travelTarget', loc.id);
    }

    // Show travel animation then go to LocationScene
    this._showTravelAnimation(loc, () => {
      this.scene.start('LocationScene');
    });
  }

  private _showTravelAnimation(loc: WorldLocation, onDone: () => void): void {
    // Fade to black with travel text
    const fade = this.add.rectangle(400, 300, 800, 600, 0x000000, 0)
      .setDepth(100);
    const msg = this.add.text(400, 290, `Travelling to ${loc.name}…`, {
      fontFamily: MONO, fontSize: '18px', color: AMB,
    }).setOrigin(0.5).setDepth(101).setAlpha(0);

    const days = this._travelDays(loc);
    const sub = this.add.text(400, 318, `${days} day${days !== 1 ? 's' : ''} pass in the wasteland.`, {
      fontFamily: MONO, fontSize: '13px', color: AMB_LO,
    }).setOrigin(0.5).setDepth(101).setAlpha(0);

    this.tweens.add({
      targets: [fade, msg, sub],
      alpha: 1,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        this.time.delayedCall(1200, onDone);
      },
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  private _buildFooter(): void {
    const y = GAME_HEIGHT - 30;

    this.add.text(10, y, 'CURRENT LOCATION:', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    }).setOrigin(0, 0.5);

    this._footerLoc = this.add.text(148, y, '', {
      fontFamily: MONO, fontSize: '10px', color: AMB_HI,
    }).setOrigin(0, 0.5);

    this._footerDay = this.add.text(400, y, '', {
      fontFamily: MONO, fontSize: '10px', color: '#88aacc',
    }).setOrigin(0.5, 0.5);

    this.add.text(GAME_WIDTH - 10, y, '[W] or [ESC] — Return to vault', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
    }).setOrigin(1, 0.5);
  }

  private _updateFooter(): void {
    this._footerLoc.setText(this._currentLoc.name);
    const days = this._charData?.days ?? 0;
    this._footerDay.setText(`Day ${days}`);
  }

  // ── Close button ──────────────────────────────────────────────────────────────

  private _buildCloseButton(): void {
    const btn = this.add.text(GAME_WIDTH - 12, 8, '[X]', {
      fontFamily: MONO, fontSize: '14px', color: AMB_LO,
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => btn.setColor(AMB_HI))
      .on('pointerout',   () => btn.setColor(AMB_LO))
      .on('pointerdown',  () => this._close());
  }

  // ── Close ─────────────────────────────────────────────────────────────────────

  private _close(): void {
    this._clearConfirm();
    this.scene.start('LocationScene');
  }
}
