/**
 * StatsSystem.ts — Fallout 1 SPECIAL-to-derived-stats and skill-base formulas.
 *
 * All formulas are taken directly from the Fallout 1 game engine.
 *
 * Points model
 * ────────────
 * Each SPECIAL stat starts at 5.  The player has 5 extra points (total sum = 40).
 * Any stat may be decreased below 5 to free up points for others.
 * Clamp: 1 ≤ stat ≤ 10.
 */

import type { SPECIAL } from '../utils/types';

// ── Derived stat types ────────────────────────────────────────────────────────

export interface DerivedStats {
  hp:          number;   // 15 + 2×EN + ST
  ac:          number;   // AG
  ap:          number;   // 5 + floor(AG / 2)
  carryWeight: number;   // 25 + ST×25   (lbs)
  meleeDamage: number;   // max(1, ST − 5)
  sequence:    number;   // PE × 2
  healingRate: number;   // max(1, floor(EN / 3))
  critChance:  number;   // LK   (%)
  skillRate:   number;   // 5 + IN×2  (skill points per level)
}

// ── Skill types ───────────────────────────────────────────────────────────────

export type SkillName =
  | 'smallGuns' | 'bigGuns'      | 'energyWeapons' | 'unarmed'      | 'meleeWeapons'
  | 'throwing'  | 'firstAid'     | 'doctor'        | 'sneak'        | 'lockpick'
  | 'steal'     | 'traps'        | 'science'       | 'repair'       | 'speech'
  | 'barter'    | 'gambling'     | 'outdoorsman';

export interface SkillEntry {
  key:   SkillName;
  label: string;      // display label (≤ 12 chars for layout)
}

/** Ordered list used for display — preserves Fallout 1 in-game ordering. */
export const SKILLS: readonly SkillEntry[] = [
  { key: 'smallGuns',     label: 'Small Guns'   },
  { key: 'bigGuns',       label: 'Big Guns'     },
  { key: 'energyWeapons', label: 'Energy Wpns'  },
  { key: 'unarmed',       label: 'Unarmed'      },
  { key: 'meleeWeapons',  label: 'Melee Wpns'   },
  { key: 'throwing',      label: 'Throwing'     },
  { key: 'firstAid',      label: 'First Aid'    },
  { key: 'doctor',        label: 'Doctor'       },
  { key: 'sneak',         label: 'Sneak'        },
  { key: 'lockpick',      label: 'Lockpick'     },
  { key: 'steal',         label: 'Steal'        },
  { key: 'traps',         label: 'Traps'        },
  { key: 'science',       label: 'Science'      },
  { key: 'repair',        label: 'Repair'       },
  { key: 'speech',        label: 'Speech'       },
  { key: 'barter',        label: 'Barter'       },
  { key: 'gambling',      label: 'Gambling'     },
  { key: 'outdoorsman',   label: 'Outdoorsmn'   },
];

// ── Points model ──────────────────────────────────────────────────────────────

/** Total SPECIAL point budget (7 stats × 5 base + 5 bonus). */
export const STAT_POOL = 40;

/**
 * Points the player still has to spend.
 * Negative means the player has somehow gone over budget (guard against this in UI).
 */
export function remainingPoints(s: SPECIAL): number {
  return STAT_POOL - (
    s.strength + s.perception + s.endurance +
    s.charisma + s.intelligence + s.agility + s.luck
  );
}

// ── Formula implementations ───────────────────────────────────────────────────

export function calcDerived(s: SPECIAL): DerivedStats {
  return {
    hp:          15 + s.endurance * 2 + s.strength,
    ac:          s.agility,
    ap:          5  + Math.floor(s.agility / 2),
    carryWeight: 25 + s.strength * 25,
    meleeDamage: Math.max(1, s.strength - 5),
    sequence:    s.perception * 2,
    healingRate: Math.max(1, Math.floor(s.endurance / 3)),
    critChance:  s.luck,
    skillRate:   5  + s.intelligence * 2,
  };
}

export function calcSkills(s: SPECIAL): Record<SkillName, number> {
  const { strength: ST, perception: PE, endurance: EN,
          charisma: CH, intelligence: IN, agility: AG, luck: LK } = s;
  return {
    smallGuns:     5  + AG * 4,
    bigGuns:            AG * 2,
    energyWeapons:      AG * 2,
    unarmed:       30 + (AG + ST) * 2,
    meleeWeapons:  20 + (AG + ST) * 2,
    throwing:           AG * 4,
    firstAid:      2  * (PE + IN),
    doctor:        5  +  PE + IN,
    sneak:         5  + AG * 3,
    lockpick:      10 + PE + AG,
    steal:              AG * 3,
    traps:         10 + PE + AG,
    science:            IN * 4,
    repair:             IN * 3,
    speech:             CH * 5,
    barter:             CH * 4,
    gambling:           LK * 5,
    outdoorsman:   2  * (EN + IN),
  };
}
