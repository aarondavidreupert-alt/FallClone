/**
 * traits.ts — All 16 selectable traits from Fallout 1.
 *
 * Traits are chosen during character creation (max 2).
 * Mechanical effects are stored here for reference; the game systems
 * that apply them (combat, skills, etc.) will read the character's
 * `traits` array and look up the relevant entry.
 */

export interface Trait {
  id:   string;
  name: string;
  desc: string;   // one-line summary shown in the UI (≤ 38 chars)
}

export const TRAITS: readonly Trait[] = [
  {
    id:   'gifted',
    name: 'Gifted',
    desc: '+1 all SPECIAL, -10% skills, fewer skill pts',
  },
  {
    id:   'fast_shot',
    name: 'Fast Shot',
    desc: '-1 AP ranged attacks, no aimed shots',
  },
  {
    id:   'bloody_mess',
    name: 'Bloody Mess',
    desc: 'Always maximum gore on deaths',
  },
  {
    id:   'finesse',
    name: 'Finesse',
    desc: '+10% critical chance, -30% damage dealt',
  },
  {
    id:   'kamikaze',
    name: 'Kamikaze',
    desc: '+5 Sequence, no defensive AC bonus',
  },
  {
    id:   'heavy_handed',
    name: 'Heavy Handed',
    desc: '+4 melee damage, -30% critical multiplier',
  },
  {
    id:   'fast_metabolism',
    name: 'Fast Metabolism',
    desc: '+2 Healing Rate, resistances always 0%',
  },
  {
    id:   'bruiser',
    name: 'Bruiser',
    desc: '+2 Strength, -2 Action Points',
  },
  {
    id:   'small_frame',
    name: 'Small Frame',
    desc: '+1 Agility, -25 lbs carry weight',
  },
  {
    id:   'one_hander',
    name: 'One Hander',
    desc: '+20% one-handed, -40% two-handed weapons',
  },
  {
    id:   'jinxed',
    name: 'Jinxed',
    desc: 'More criticals for you AND your enemies',
  },
  {
    id:   'good_natured',
    name: 'Good Natured',
    desc: '+15% social skills, -10% combat skills',
  },
  {
    id:   'chem_reliant',
    name: 'Chem Reliant',
    desc: 'x2 drug bonus and withdrawal rate',
  },
  {
    id:   'chem_resistant',
    name: 'Chem Resistant',
    desc: 'Half drug effect, no addiction risk',
  },
  {
    id:   'night_person',
    name: 'Night Person',
    desc: '+2 PE/IN at night, -2 PE/IN during day',
  },
  {
    id:   'skilled',
    name: 'Skilled',
    desc: '+5 skill pts/level, perks every 4 levels',
  },
];
