/**
 * enemies.ts — Enemy definitions for the Fallout 1 browser clone.
 *
 * All stats are based on Fallout 1 original creature stats.
 * Placeholder colours are used until FRM sprite assets are available.
 */

export interface EnemyDef {
  readonly id:            string;
  readonly name:          string;
  readonly hp:            number;
  readonly ac:            number;    // Armor Class
  readonly dr:            number;    // Damage Resistance (% normal)
  readonly dt:            number;    // Damage Threshold
  readonly dmgMin:        number;
  readonly dmgMax:        number;
  readonly attackSkill:   number;    // base hit-chance %
  readonly attackRange:   number;    // tiles (Chebyshev)
  readonly attackAPCost:  number;
  readonly moveAPCost:    number;    // AP cost per tile of movement
  readonly maxAP:         number;
  readonly xp:            number;    // XP awarded on kill
  readonly color:         number;    // placeholder dot colour (hex)
}

const ENEMIES: Record<string, EnemyDef> = {

  radscorpion: {
    id:           'radscorpion',
    name:         'Radscorpion',
    hp:           40,
    ac:           7,
    dr:           15,
    dt:           2,
    dmgMin:       5,
    dmgMax:       12,
    attackSkill:  60,
    attackRange:  2,
    attackAPCost: 4,
    moveAPCost:   2,
    maxAP:        8,
    xp:           200,
    color:        0x55cc00,
  },

  mole_rat: {
    id:           'mole_rat',
    name:         'Mole Rat',
    hp:           20,
    ac:           4,
    dr:           0,
    dt:           0,
    dmgMin:       3,
    dmgMax:       7,
    attackSkill:  55,
    attackRange:  1,
    attackAPCost: 3,
    moveAPCost:   1,
    maxAP:        8,
    xp:           75,
    color:        0x996633,
  },

  raider: {
    id:           'raider',
    name:         'Raider',
    hp:           30,
    ac:           5,
    dr:           10,
    dt:           0,
    dmgMin:       4,
    dmgMax:       10,
    attackSkill:  50,
    attackRange:  10,
    attackAPCost: 5,
    moveAPCost:   1,
    maxAP:        8,
    xp:           110,
    color:        0xaa4422,
  },
};

export function getEnemyDef(id: string): EnemyDef | undefined {
  return ENEMIES[id];
}
