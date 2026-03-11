/**
 * AssetRegistry.ts — Runtime asset discovery via Fallout 1 LST lookup tables.
 *
 * Fallout 1 organises its art through plain-text list files (TILES.LST,
 * CRITTERS.LST, WALLS.LST, ITEMS.LST, SCENERY.LST).  These are pre-converted
 * to JSON arrays and served from public/assets/data/ so they are available in
 * both dev and production without being bundled into JS.
 *
 * Boot flow
 * ─────────
 * 1. BootScene fetches all LST tables via loadLstTables().
 * 2. The result (LstData) is stored in the Phaser registry under 'lstData'.
 * 3. PreloadScene reads LstData and loads every referenced PNG with the key
 *    'tile_idx_<N>' where N is the raw floor ID from the MAP file.
 *
 * URL conventions (files live in public/assets/)
 * ────────────────────────────────────────────────
 * Tiles:    /assets/tiles/<stem>.png       (80×36 floor/roof diamonds)
 * Critters: /assets/sprites/critters/<stem>.png  + <stem>.json
 * UI:       /assets/ui/<stem>.png
 *
 * If a file is absent the fetch silently returns [] so the game falls back to
 * procedural placeholder textures without crashing.
 */

// ── LST data types ────────────────────────────────────────────────────────────

/**
 * All LST table arrays, fetched at boot from public/assets/data/.
 *
 * Each array entry is an art stem (filename without extension).
 * Array index N matches the art index used in the MAP file:
 *   tile.floor === N  →  /assets/tiles/<tiles[N]>.png
 */
export interface LstData {
  readonly tiles:    string[];   // TILES.LST    → /assets/tiles/
  readonly critters: string[];   // CRITTERS.LST → /assets/sprites/critters/
  readonly items:    string[];   // ITEMS.LST    → /assets/items/
  readonly scenery:  string[];   // SCENERY.LST  → /assets/scenery/
  readonly walls:    string[];   // WALLS.LST    → /assets/walls/
}

/** Sentinel value used before LST tables finish loading. */
export const EMPTY_LST: LstData = {
  tiles: [], critters: [], items: [], scenery: [], walls: [],
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJsonArray(url: string): Promise<string[]> {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data: unknown = await r.json();
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch all five LST tables from public/assets/data/ in parallel.
 *
 * Any file that is absent or returns a non-array is treated as an empty list
 * so the game continues with procedural placeholder textures.
 */
export async function loadLstTables(): Promise<LstData> {
  const base = '/assets/data';
  const [tiles, critters, items, scenery, walls] = await Promise.all([
    fetchJsonArray(`${base}/tiles_lst.json`),
    fetchJsonArray(`${base}/critters_lst.json`),
    fetchJsonArray(`${base}/items_lst.json`),
    fetchJsonArray(`${base}/scenery_lst.json`),
    fetchJsonArray(`${base}/walls_lst.json`),
  ]);
  console.log(
    `[AssetRegistry] LST tables loaded — ` +
    `tiles:${tiles.length} critters:${critters.length} ` +
    `items:${items.length} scenery:${scenery.length} walls:${walls.length}`,
  );
  return { tiles, critters, items, scenery, walls };
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Return the public URL for tile index N (= raw MAP floor ID), or null if the
 * LST does not have an entry at that index.
 */
export function tileUrlForId(n: number, lst: LstData): string | null {
  const stem = lst.tiles[n];
  return stem ? `/assets/tiles/${stem}.png` : null;
}

/**
 * Return the public URL for critter index N, or null.
 * Used for player / NPC sprite loading when a full critters LST is available.
 */
export function critterUrlForId(n: number, lst: LstData): string | null {
  const stem = lst.critters[n];
  return stem ? `/assets/sprites/critters/${stem}.png` : null;
}

/** True when at least one tile is available in the LST. */
export const hasTiles = (lst: LstData): boolean => lst.tiles.length > 0;

/** True when at least one critter is available in the LST. */
export const hasCritters = (lst: LstData): boolean => lst.critters.length > 0;
