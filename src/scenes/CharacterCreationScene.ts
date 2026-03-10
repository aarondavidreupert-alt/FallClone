/**
 * CharacterCreationScene.ts — Fallout 1-style character creation screen.
 *
 * Layout (800 × 600)
 * ──────────────────
 *  Header  (y 0–56)   : title, name input, sex toggle
 *  Col 1   (x 15–260) : S.P.E.C.I.A.L. allocation + derived stats
 *  Col 2   (x 280–530): 18 auto-calculated skills
 *  Col 3   (x 553–790): 16 traits (pick up to 2)
 *  Footer  (y 510–590): message area + "ENTER THE VAULT" confirm button
 *
 * Points model (Fallout 1)
 * ────────────────────────
 * Every stat starts at 5; the player has 5 bonus points (pool = 40).
 * Any stat may be decreased below 5 (min 1) to free points for others.
 * remainingPoints = 40 − sum(all stats).
 *
 * Keyboard input
 * ──────────────
 * All keystrokes go to the NAME field (no keyboard SPECIAL adjustment — use ◄/►).
 * Printable chars append; Backspace removes; Enter confirms.
 */

import Phaser from 'phaser';
import type { SPECIAL, CharacterData } from '../utils/types';
import {
  calcDerived, calcSkills, remainingPoints,
  SKILLS, type DerivedStats, type SkillName,
} from '../systems/StatsSystem';
import { TRAITS } from '../data/traits';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/constants';

// ── Colour palette ────────────────────────────────────────────────────────────
const AMB    = '#c8a000';   // standard amber
const AMB_HI = '#ffd700';   // bright amber — titles / hover / selected
const AMB_LO = '#7a6000';   // dim amber — secondary labels
const GREEN  = '#66cc00';   // trait check mark
const RED    = '#cc3300';   // error / warning text
const MONO   = 'monospace';

// ── Column x-anchors ─────────────────────────────────────────────────────────
const COL1 = 15;
const COL2 = 280;
const COL3 = 553;

// ── SPECIAL stat display order ────────────────────────────────────────────────
const SPECIALS: Array<{ key: keyof SPECIAL; label: string }> = [
  { key: 'strength',     label: 'STRENGTH'     },
  { key: 'perception',   label: 'PERCEPTION'   },
  { key: 'endurance',    label: 'ENDURANCE'    },
  { key: 'charisma',     label: 'CHARISMA'     },
  { key: 'intelligence', label: 'INTELLIGENCE' },
  { key: 'agility',      label: 'AGILITY'      },
  { key: 'luck',         label: 'LUCK'         },
];

// ── Derived stat display order ────────────────────────────────────────────────
const DERIVED_ROWS: Array<[keyof DerivedStats, string, string]> = [
  // [key,          label,          unit-suffix]
  ['hp',          'Hit Points',  ''     ],
  ['ac',          'Armor Class', ''     ],
  ['ap',          'Action Pts',  ''     ],
  ['carryWeight', 'Carry Wt',    ' lbs' ],
  ['meleeDamage', 'Melee Dmg',   ''     ],
  ['sequence',    'Sequence',    ''     ],
  ['healingRate', 'Heal Rate',   ''     ],
  ['critChance',  'Crit Chance', '%'    ],
  ['skillRate',   'Skill Pts/Lv',''     ],
];

// ─────────────────────────────────────────────────────────────────────────────

export class CharacterCreationScene extends Phaser.Scene {

  // ── Character state ───────────────────────────────────────────────────────
  private _special: SPECIAL = {
    strength: 5, perception: 5, endurance: 5,
    charisma:  5, intelligence: 5, agility: 5, luck: 5,
  };
  private _sex: 'MALE' | 'FEMALE' = 'MALE';
  private _name  = 'VAULT DWELLER';
  private _selectedTraits = new Set<string>();
  private _cursorOn = true;

  // ── Live-update UI refs ───────────────────────────────────────────────────
  private _nameText!:     Phaser.GameObjects.Text;
  private _sexText!:      Phaser.GameObjects.Text;
  private _pointsText!:   Phaser.GameObjects.Text;
  private _specialVals    = new Map<keyof SPECIAL, Phaser.GameObjects.Text>();
  private _derivedVals:   Phaser.GameObjects.Text[] = [];
  private _skillVals:     Phaser.GameObjects.Text[] = [];
  private _traitChecks    = new Map<string, Phaser.GameObjects.Text>();
  private _traitsHeader!: Phaser.GameObjects.Text;
  private _traitDescText!:Phaser.GameObjects.Text;
  private _msgText!:      Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'CharacterCreationScene' });
  }

  create(): void {
    this._drawBackground();
    this._buildHeader();
    this._buildSpecialPanel();
    this._buildDerivedPanel();
    this._buildSkillsPanel();
    this._buildTraitsPanel();
    this._buildFooter();
    this._setupKeyboard();
    this._startCursorBlink();
    this._refresh();
  }

  // ── Background & chrome ───────────────────────────────────────────────────

  private _drawBackground(): void {
    const g = this.add.graphics();

    // Base fill
    g.fillStyle(0x0d0a00);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Subtle scanlines
    g.fillStyle(0x000000, 0.18);
    for (let y = 0; y < GAME_HEIGHT; y += 2) g.fillRect(0, y, GAME_WIDTH, 1);

    // Outer border
    g.lineStyle(1, 0x4a3800, 1);
    g.strokeRect(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8);

    // Header & footer separators
    g.lineStyle(1, 0x4a3800, 1);
    g.lineBetween(10, 56,  GAME_WIDTH - 10, 56);
    g.lineBetween(10, 510, GAME_WIDTH - 10, 510);

    // Column dividers
    g.lineStyle(1, 0x2e2200, 1);
    g.lineBetween(268, 58, 268, 508);
    g.lineBetween(540, 58, 540, 508);

    // In-column separator (SPECIAL / Derived)
    g.lineStyle(1, 0x2e2200, 0.7);
    g.lineBetween(COL1, 283, 258, 283);
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private _buildHeader(): void {
    // Title
    this.add.text(GAME_WIDTH / 2, 16, 'CHARACTER EDITOR', {
      fontFamily: MONO, fontSize: '22px', color: AMB_HI,
    }).setOrigin(0.5, 0.5);

    // Name field label
    this.add.text(COL1, 38, 'NAME:', {
      fontFamily: MONO, fontSize: '13px', color: AMB_LO,
    }).setOrigin(0, 0.5);

    // Name value + cursor (updated by _refreshName)
    this._nameText = this.add.text(75, 38, '', {
      fontFamily: MONO, fontSize: '13px', color: AMB_HI,
    }).setOrigin(0, 0.5);

    // Sex label + interactive toggle
    this.add.text(490, 38, 'SEX:', {
      fontFamily: MONO, fontSize: '13px', color: AMB_LO,
    }).setOrigin(0, 0.5);

    this._sexText = this.add.text(534, 38, this._sex, {
      fontFamily: MONO, fontSize: '13px', color: AMB,
    })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => this._sexText.setColor(AMB_HI))
      .on('pointerout',   () => this._sexText.setColor(AMB))
      .on('pointerdown',  () => {
        this._sex = this._sex === 'MALE' ? 'FEMALE' : 'MALE';
        this._sexText.setText(this._sex);
      });
  }

  // ── SPECIAL panel ─────────────────────────────────────────────────────────

  private _buildSpecialPanel(): void {
    this.add.text(COL1, 65, 'S.P.E.C.I.A.L.', {
      fontFamily: MONO, fontSize: '13px', color: AMB_HI, fontStyle: 'bold',
    });

    SPECIALS.forEach(({ key, label }, i) => {
      const y = 83 + i * 26;

      // First letter highlighted, rest dim
      this.add.text(COL1,      y, label[0],      { fontFamily: MONO, fontSize: '13px', color: AMB_HI });
      this.add.text(COL1 + 9,  y, label.slice(1), { fontFamily: MONO, fontSize: '13px', color: AMB_LO });

      // Stat value (right-aligned at x=173)
      const valTxt = this.add.text(173, y, '5', {
        fontFamily: MONO, fontSize: '13px', color: AMB,
      }).setOrigin(1, 0);
      this._specialVals.set(key, valTxt);

      // Decrease ◄
      const minus = this.add.text(182, y, '◄', {
        fontFamily: MONO, fontSize: '13px', color: AMB_LO,
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerover',  () => minus.setColor(AMB_HI))
        .on('pointerout',   () => minus.setColor(AMB_LO))
        .on('pointerdown',  () => this._adjustStat(key, -1));

      // Increase ►
      const plus = this.add.text(208, y, '►', {
        fontFamily: MONO, fontSize: '13px', color: AMB_LO,
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerover',  () => plus.setColor(AMB_HI))
        .on('pointerout',   () => plus.setColor(AMB_LO))
        .on('pointerdown',  () => this._adjustStat(key, +1));
    });

    this._pointsText = this.add.text(COL1, 270, '', {
      fontFamily: MONO, fontSize: '12px', color: AMB,
    });
  }

  // ── Derived stats panel ───────────────────────────────────────────────────

  private _buildDerivedPanel(): void {
    this.add.text(COL1, 292, 'DERIVED STATS', {
      fontFamily: MONO, fontSize: '12px', color: AMB_HI, fontStyle: 'bold',
    });

    DERIVED_ROWS.forEach(([, label], i) => {
      const y = 310 + i * 19;
      this.add.text(COL1, y, label, {
        fontFamily: MONO, fontSize: '11px', color: AMB_LO,
      });
      const val = this.add.text(258, y, '', {
        fontFamily: MONO, fontSize: '11px', color: AMB,
      }).setOrigin(1, 0);
      this._derivedVals.push(val);
    });
  }

  // ── Skills panel ──────────────────────────────────────────────────────────

  private _buildSkillsPanel(): void {
    this.add.text(COL2, 65, 'SKILLS', {
      fontFamily: MONO, fontSize: '13px', color: AMB_HI, fontStyle: 'bold',
    });

    SKILLS.forEach(({ label }, i) => {
      const y = 83 + i * 23;
      this.add.text(COL2, y, label, {
        fontFamily: MONO, fontSize: '11px', color: AMB_LO,
      });
      const pct = this.add.text(532, y, '', {
        fontFamily: MONO, fontSize: '11px', color: AMB,
      }).setOrigin(1, 0);
      this._skillVals.push(pct);
    });
  }

  // ── Traits panel ──────────────────────────────────────────────────────────

  private _buildTraitsPanel(): void {
    this._traitsHeader = this.add.text(COL3, 65, 'TRAITS  [0/2]', {
      fontFamily: MONO, fontSize: '13px', color: AMB_HI, fontStyle: 'bold',
    });

    TRAITS.forEach((trait, i) => {
      const y = 83 + i * 24;

      const check = this.add.text(COL3, y, '[ ]', {
        fontFamily: MONO, fontSize: '11px', color: AMB_LO,
      });
      this._traitChecks.set(trait.id, check);

      const nameTxt = this.add.text(COL3 + 26, y, trait.name, {
        fontFamily: MONO, fontSize: '11px', color: AMB,
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          if (!this._selectedTraits.has(trait.id)) nameTxt.setColor(AMB_HI);
          this._traitDescText.setText(trait.desc);
        })
        .on('pointerout', () => {
          if (!this._selectedTraits.has(trait.id)) nameTxt.setColor(AMB);
          this._traitDescText.setText('');
        })
        .on('pointerdown', () => this._toggleTrait(trait.id, nameTxt, check));
    });

    // Description area at the bottom of the traits column
    this._traitDescText = this.add.text(COL3, 474, '', {
      fontFamily: MONO, fontSize: '10px', color: AMB_LO,
      wordWrap: { width: 232 },
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  private _buildFooter(): void {
    this._msgText = this.add.text(GAME_WIDTH / 2, 522, '', {
      fontFamily: MONO, fontSize: '12px', color: RED,
    }).setOrigin(0.5, 0);

    const btn = this.add.text(GAME_WIDTH / 2, 558, '[ ENTER THE VAULT ]', {
      fontFamily: MONO, fontSize: '17px', color: AMB, fontStyle: 'bold',
    })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover',  () => btn.setColor(AMB_HI))
      .on('pointerout',   () => btn.setColor(AMB))
      .on('pointerdown',  () => this._confirm());
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  private _setupKeyboard(): void {
    this.input.keyboard!.on('keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Backspace') {
        this._name = this._name.slice(0, -1);
      } else if (evt.key === 'Enter') {
        this._confirm();
        return;
      } else if (evt.key.length === 1 && this._name.length < 20) {
        this._name += evt.key.toUpperCase();
      }
      this._refreshName();
    });
  }

  private _startCursorBlink(): void {
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => { this._cursorOn = !this._cursorOn; this._refreshName(); },
    });
  }

  // ── State mutation ────────────────────────────────────────────────────────

  private _adjustStat(key: keyof SPECIAL, delta: number): void {
    const next = this._special[key] + delta;
    if (next < 1 || next > 10) return;
    if (delta > 0 && remainingPoints(this._special) <= 0) {
      this._showMsg('No points remaining — decrease another stat first.');
      return;
    }
    this._special[key] = next;
    this._msgText.setText('');
    this._refresh();
  }

  private _toggleTrait(
    id:      string,
    nameTxt: Phaser.GameObjects.Text,
    check:   Phaser.GameObjects.Text,
  ): void {
    if (this._selectedTraits.has(id)) {
      this._selectedTraits.delete(id);
      check.setColor(AMB_LO).setText('[ ]');
      nameTxt.setColor(AMB);
    } else {
      if (this._selectedTraits.size >= 2) {
        this._showMsg('You may only select 2 traits.');
        return;
      }
      this._selectedTraits.add(id);
      check.setColor(GREEN).setText('[✓]');
      nameTxt.setColor(AMB_HI);
    }
    this._traitsHeader.setText(`TRAITS  [${this._selectedTraits.size}/2]`);
    this._msgText.setText('');
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  private _confirm(): void {
    const trimmed = this._name.trim();
    if (trimmed.length === 0) {
      this._showMsg('Please enter a name for your character.');
      return;
    }

    const derived = calcDerived(this._special);
    const skills  = calcSkills(this._special);
    const skillRecord: Record<string, number> = {};
    for (const { key } of SKILLS) {
      skillRecord[key] = (skills as Record<SkillName, number>)[key];
    }

    const charData: CharacterData = {
      id:        Phaser.Math.RND.uuid(),
      name:      trimmed,
      special:   { ...this._special },
      skills:    skillRecord,
      traits:    [...this._selectedTraits],
      perks:     [],
      level:     1,
      xp:        0,
      hp:        derived.hp,
      max_hp:    derived.hp,
      ap:        derived.ap,
      max_ap:    derived.ap,
      karma:     0,
      inventory: [],
      equipped:  { armor: null, weapon: null },
      // Phase 8
      quests:        [],
      questFlags:    {},
      days:          0,
      worldUnlocked: false,
    };

    this.registry.set('characterData', charData);
    this.scene.start('LocationScene');
  }

  // ── Live refresh ──────────────────────────────────────────────────────────

  private _refresh(): void {
    this._refreshName();
    this._refreshSpecial();
    this._refreshDerived();
    this._refreshSkills();
  }

  private _refreshName(): void {
    this._nameText.setText(this._name + (this._cursorOn ? '_' : ' '));
  }

  private _refreshSpecial(): void {
    for (const { key } of SPECIALS) {
      this._specialVals.get(key)?.setText(String(this._special[key]));
    }
    const pts = remainingPoints(this._special);
    this._pointsText
      .setText(`Points remaining: ${pts}`)
      .setColor(pts <= 0 ? (pts < 0 ? RED : AMB_LO) : AMB);
  }

  private _refreshDerived(): void {
    const d = calcDerived(this._special);
    DERIVED_ROWS.forEach(([key, , suffix], i) => {
      this._derivedVals[i].setText(String(d[key]) + suffix);
    });
  }

  private _refreshSkills(): void {
    const s = calcSkills(this._special);
    SKILLS.forEach(({ key }, i) => {
      this._skillVals[i].setText((s as Record<SkillName, number>)[key] + '%');
    });
  }

  private _showMsg(msg: string): void {
    this._msgText.setText(msg);
    this.time.delayedCall(3000, () => this._msgText.setText(''));
  }
}
