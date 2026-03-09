/**
 * InventorySystem.ts — Inventory management for Fallout 1 browser clone.
 *
 * Responsibilities
 * ────────────────
 * • Add / remove items from a CharacterData inventory.
 * • Equip / unequip items to armor and weapon slots.
 * • Use consumables (healing, radaway, food).
 * • Track carry weight and overweight penalty.
 *
 * The system operates purely on plain data (CharacterData) and returns
 * an ActionResult describing what happened — no Phaser dependency here.
 */

import type { CharacterData, ItemInstance } from '../utils/types';
import { getItem } from '../data/items';
import type { ItemDef } from '../data/items';
import { calcDerived } from './StatsSystem';

// ── Result types ──────────────────────────────────────────────────────────────

export interface ActionResult {
  ok:      boolean;
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find an ItemInstance in inventory by item id. */
function findSlot(char: CharacterData, itemId: string): ItemInstance | undefined {
  return char.inventory.find(i => i.id === itemId);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add `quantity` of item `itemId` to the character's inventory.
 * Stackable items are merged; non-stackable items are each their own slot.
 */
export function addItem(char: CharacterData, itemId: string, quantity = 1): ActionResult {
  const def = getItem(itemId);
  if (!def) return { ok: false, message: `Unknown item: ${itemId}` };

  if (def.stackable) {
    const slot = findSlot(char, itemId);
    if (slot) {
      slot.quantity += quantity;
    } else {
      char.inventory.push({ id: itemId, quantity });
    }
  } else {
    // Each non-stackable item is its own entry (quantity always 1 per slot)
    for (let i = 0; i < quantity; i++) {
      char.inventory.push({ id: itemId, quantity: 1 });
    }
  }

  return { ok: true, message: `Picked up ${quantity > 1 ? quantity + '× ' : ''}${def.name}.` };
}

/**
 * Remove `quantity` of item `itemId` from inventory.
 * Removes the slot entirely if quantity reaches 0.
 * Returns false if the character doesn't have enough.
 */
export function removeItem(char: CharacterData, itemId: string, quantity = 1): ActionResult {
  const def = getItem(itemId);
  if (!def) return { ok: false, message: `Unknown item: ${itemId}` };

  if (def.stackable) {
    const slot = findSlot(char, itemId);
    if (!slot || slot.quantity < quantity) {
      return { ok: false, message: `Not enough ${def.name}.` };
    }
    slot.quantity -= quantity;
    if (slot.quantity <= 0) {
      char.inventory = char.inventory.filter(i => i !== slot);
    }
  } else {
    // For non-stackable, find the first matching slot and remove it
    const idx = char.inventory.findIndex(i => i.id === itemId);
    if (idx === -1) return { ok: false, message: `${def.name} not in inventory.` };
    char.inventory.splice(idx, 1);
  }

  return { ok: true, message: `Removed ${def.name}.` };
}

/**
 * Equip an item to its appropriate slot ('armor' or 'weapon').
 * Unequips whatever was in that slot first.
 */
export function equipItem(char: CharacterData, itemId: string): ActionResult {
  const def = getItem(itemId);
  if (!def) return { ok: false, message: `Unknown item: ${itemId}` };

  if (def.type !== 'armor' && def.type !== 'weapon') {
    return { ok: false, message: `${def.name} cannot be equipped.` };
  }

  // Must have the item in inventory first
  const slot = findSlot(char, itemId);
  if (!slot) return { ok: false, message: `${def.name} not in inventory.` };

  const equipSlot = def.type === 'armor' ? 'armor' : 'weapon';

  // Unequip current item in the slot (put back in inventory conceptually — it stays in inv)
  char.equipped[equipSlot] = itemId;

  return { ok: true, message: `Equipped ${def.name}.` };
}

/**
 * Unequip the item in a given slot.
 */
export function unequipSlot(char: CharacterData, slot: 'armor' | 'weapon'): ActionResult {
  const itemId = char.equipped[slot];
  if (!itemId) return { ok: false, message: `Nothing equipped in ${slot} slot.` };
  const def = getItem(itemId)!;
  char.equipped[slot] = null;
  return { ok: true, message: `Unequipped ${def.name}.` };
}

/**
 * Use a consumable item.  Modifies CharacterData in-place.
 * Returns ActionResult describing the effect.
 */
export function useItem(char: CharacterData, itemId: string): ActionResult {
  const def = getItem(itemId);
  if (!def) return { ok: false, message: `Unknown item: ${itemId}` };

  if (def.type !== 'consumable') {
    return { ok: false, message: `${def.name} cannot be used this way.` };
  }

  const slot = findSlot(char, itemId);
  if (!slot) return { ok: false, message: `${def.name} not in inventory.` };

  let resultMsg = '';

  switch (def.effect) {
    case 'heal':
    case 'food': {
      const heal = def.healAmount ?? 0;
      const before = char.hp;
      char.hp = Math.min(char.max_hp, char.hp + heal);
      const actual = char.hp - before;
      resultMsg = actual > 0
        ? `Used ${def.name}. Healed ${actual} HP.`
        : `Used ${def.name}. (already at full health)`;
      break;
    }
    case 'radaway': {
      resultMsg = `Used ${def.name}. Radiation removed.`;
      break;
    }
    default:
      resultMsg = `Used ${def.name}.`;
  }

  // Consume one from inventory
  removeItem(char, itemId, 1);
  return { ok: true, message: resultMsg };
}

/**
 * Drop an item: remove it from inventory (and unequip if equipped).
 * Returns the ItemDef so the caller can spawn a GroundItem.
 */
export function dropItem(char: CharacterData, itemId: string): { result: ActionResult; def: ItemDef | undefined } {
  const def = getItem(itemId);
  if (!def) return { result: { ok: false, message: `Unknown item: ${itemId}` }, def: undefined };

  // Auto-unequip if dropping an equipped item
  if (char.equipped.armor === itemId)  char.equipped.armor  = null;
  if (char.equipped.weapon === itemId) char.equipped.weapon = null;

  const remove = removeItem(char, itemId, 1);
  if (!remove.ok) return { result: remove, def: undefined };

  return { result: { ok: true, message: `Dropped ${def.name}.` }, def };
}

/**
 * Total carried weight in lbs.
 */
export function totalWeight(char: CharacterData): number {
  let w = 0;
  for (const slot of char.inventory) {
    const def = getItem(slot.id);
    if (def) w += def.weight * slot.quantity;
  }
  return w;
}

/**
 * Max carry weight from SPECIAL (lbs).
 */
export function maxCarryWeight(char: CharacterData): number {
  return calcDerived(char.special).carryWeight;
}

/**
 * True if the character is carrying more than their limit.
 */
export function isOverweight(char: CharacterData): boolean {
  return totalWeight(char) > maxCarryWeight(char);
}

/**
 * Count the total number of distinct item slots in inventory.
 */
export function inventoryCount(char: CharacterData): number {
  return char.inventory.length;
}

/**
 * Merge-aware quantity lookup: total count of an item id.
 */
export function itemCount(char: CharacterData, itemId: string): number {
  return char.inventory
    .filter(i => i.id === itemId)
    .reduce((sum, i) => sum + i.quantity, 0);
}
