/**
 * items.ts — Fallout 1 item definitions.
 *
 * Each ItemDef describes a class of item.  ItemInstance (in types.ts)
 * is a { id, quantity } reference into this registry.
 */

export type ItemType = 'weapon' | 'armor' | 'consumable' | 'misc';

export interface ItemDef {
  readonly id:          string;
  readonly name:        string;
  readonly description: string;
  readonly type:        ItemType;
  readonly weight:      number;   // lbs
  readonly value:       number;   // caps
  readonly stackable:   boolean;

  // ── Weapon ────────────────────────────────────────────────────────────────
  readonly dmgMin?:   number;
  readonly dmgMax?:   number;
  readonly skill?:    string;   // e.g. 'smallGuns', 'meleeWeapons', 'unarmed'
  readonly apCost?:   number;
  readonly range?:    number;   // tiles

  // ── Armor ─────────────────────────────────────────────────────────────────
  readonly ac?:       number;   // AC bonus
  readonly dr?:       number;   // % damage resistance (normal)

  // ── Consumable ────────────────────────────────────────────────────────────
  readonly healAmount?:    number;
  readonly radReduction?:  number;
  readonly effect?:        'heal' | 'radaway' | 'food' | 'drug';
}

// ── Registry ──────────────────────────────────────────────────────────────────

const ITEMS: Record<string, ItemDef> = {

  // ─── Consumables ──────────────────────────────────────────────────────────

  stimpak: {
    id: 'stimpak',
    name: 'Stimpak',
    description: 'A healing chem that stimulates the body\'s own healing processes. Restores 10 HP.',
    type: 'consumable',
    weight: 0,
    value: 175,
    stackable: true,
    effect: 'heal',
    healAmount: 10,
  },

  super_stimpak: {
    id: 'super_stimpak',
    name: 'Super Stimpak',
    description: 'A super version of the Stimpak. Restores 25 HP, but causes minor side effects.',
    type: 'consumable',
    weight: 1,
    value: 250,
    stackable: true,
    effect: 'heal',
    healAmount: 25,
  },

  rad_away: {
    id: 'rad_away',
    name: 'RadAway',
    description: 'A chemical solution that bonds with radiation particles and removes them from the body.',
    type: 'consumable',
    weight: 0,
    value: 200,
    stackable: true,
    effect: 'radaway',
    radReduction: 150,
  },

  iguana_on_stick: {
    id: 'iguana_on_stick',
    name: 'Iguana on a Stick',
    description: 'Roasted iguana meat on a stick. Wasteland cuisine at its finest. Restores 4 HP.',
    type: 'consumable',
    weight: 1,
    value: 4,
    stackable: true,
    effect: 'food',
    healAmount: 4,
  },

  water_flask: {
    id: 'water_flask',
    name: 'Water Flask',
    description: 'A flask of clean water. Worth more than gold in the wasteland. Restores 2 HP.',
    type: 'consumable',
    weight: 1,
    value: 10,
    stackable: false,
    effect: 'food',
    healAmount: 2,
  },

  // ─── Weapons ──────────────────────────────────────────────────────────────

  pistol_10mm: {
    id: 'pistol_10mm',
    name: '10mm Pistol',
    description: 'The "Old Faithful" of handguns. Reliable, accurate and cheap to produce.',
    type: 'weapon',
    weight: 3,
    value: 450,
    stackable: false,
    dmgMin: 5,
    dmgMax: 12,
    skill: 'smallGuns',
    apCost: 5,
    range: 15,
  },

  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    description: 'A short 12 gauge pump action shotgun. Good for short range.',
    type: 'weapon',
    weight: 5,
    value: 900,
    stackable: false,
    dmgMin: 12,
    dmgMax: 24,
    skill: 'smallGuns',
    apCost: 6,
    range: 7,
  },

  hunting_rifle: {
    id: 'hunting_rifle',
    name: 'Hunting Rifle',
    description: 'A semi-automatic long-range rifle. Reliable with a good scope.',
    type: 'weapon',
    weight: 9,
    value: 1000,
    stackable: false,
    dmgMin: 8,
    dmgMax: 20,
    skill: 'smallGuns',
    apCost: 6,
    range: 25,
  },

  combat_knife: {
    id: 'combat_knife',
    name: 'Combat Knife',
    description: 'A large fighting knife. Quiet and effective.',
    type: 'weapon',
    weight: 1,
    value: 200,
    stackable: false,
    dmgMin: 3,
    dmgMax: 7,
    skill: 'meleeWeapons',
    apCost: 4,
    range: 1,
  },

  brass_knuckles: {
    id: 'brass_knuckles',
    name: 'Brass Knuckles',
    description: 'A set of brass knuckles. Simple, but they make your punch hurt a lot more.',
    type: 'weapon',
    weight: 1,
    value: 75,
    stackable: false,
    dmgMin: 2,
    dmgMax: 5,
    skill: 'unarmed',
    apCost: 3,
    range: 1,
  },

  spear: {
    id: 'spear',
    name: 'Spear',
    description: 'A wooden spear hardened by fire. Reach weapon.',
    type: 'weapon',
    weight: 5,
    value: 75,
    stackable: false,
    dmgMin: 4,
    dmgMax: 12,
    skill: 'meleeWeapons',
    apCost: 4,
    range: 2,
  },

  // ─── Armor ────────────────────────────────────────────────────────────────

  leather_jacket: {
    id: 'leather_jacket',
    name: 'Leather Jacket',
    description: 'A tough leather jacket. Provides minimal protection.',
    type: 'armor',
    weight: 5,
    value: 250,
    stackable: false,
    ac: 1,
    dr: 5,
  },

  leather_armor: {
    id: 'leather_armor',
    name: 'Leather Armor',
    description: 'Firm leather has been shaped and layered to provide decent protection.',
    type: 'armor',
    weight: 15,
    value: 700,
    stackable: false,
    ac: 3,
    dr: 15,
  },

  metal_armor: {
    id: 'metal_armor',
    name: 'Metal Armor',
    description: 'Plates of metal, carefully angled for deflection, form this suit of armor.',
    type: 'armor',
    weight: 35,
    value: 1100,
    stackable: false,
    ac: 6,
    dr: 25,
  },

  vault_suit: {
    id: 'vault_suit',
    name: 'Vault Suit',
    description: 'The standard vault dweller uniform. Provides minimal protection.',
    type: 'armor',
    weight: 2,
    value: 100,
    stackable: false,
    ac: 0,
    dr: 0,
  },

  // ─── Misc ─────────────────────────────────────────────────────────────────

  caps: {
    id: 'caps',
    name: 'Bottle Caps',
    description: 'Pre-war bottlecaps used as currency in the wasteland.',
    type: 'misc',
    weight: 0,
    value: 1,
    stackable: true,
  },

  rope: {
    id: 'rope',
    name: 'Rope',
    description: 'A coil of old but sturdy rope. Useful for many things.',
    type: 'misc',
    weight: 2,
    value: 25,
    stackable: false,
  },

  ammo_10mm: {
    id: 'ammo_10mm',
    name: '10mm Ammo',
    description: 'A box of 10mm rounds.',
    type: 'misc',
    weight: 0,
    value: 60,
    stackable: true,
  },

  ammo_shotgun: {
    id: 'ammo_shotgun',
    name: 'Shotgun Shells',
    description: 'A box of standard 12 gauge shotgun shells.',
    type: 'misc',
    weight: 0,
    value: 40,
    stackable: true,
  },
};

export default ITEMS;

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

/** All items as an array, sorted by name. */
export function allItems(): ItemDef[] {
  return Object.values(ITEMS).sort((a, b) => a.name.localeCompare(b.name));
}
