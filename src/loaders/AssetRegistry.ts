/**
 * AssetRegistry.ts — Discovers converted Fallout 1 assets at build/dev time.
 *
 * Uses Vite's import.meta.glob to enumerate PNGs present in assets/.
 * Returns empty maps when directories are absent or empty, so the rest of the
 * code can safely fall back to procedural placeholders.
 *
 * Fallout 1 naming conventions (after frm_to_png.py conversion)
 * ──────────────────────────────────────────────────────────────
 * art/tiles/      → assets/tiles/<stem>.png   (80×36 diamond tiles)
 * art/critters/   → assets/sprites/critters/<stem>.png  + <stem>.json
 * art/intrface/   → assets/ui/<stem>.png
 *
 * Common critter stems (lowercase):
 *   haaaa   — male vault dweller idle (6 directions × 1 frame)
 *   hfmaat  — female vault dweller walking (6 dirs × several frames)
 *   haovrnt — overseer/boss NPC
 *   scrpna  — radscorpion attack
 *
 * Common tile stems (naming varies; may be purely numeric like "0001"):
 *   If tiles have descriptive names the heuristics below match them.
 *   If numeric, tiles are assigned by sorted position.
 */

// ── Vite glob discovery ───────────────────────────────────────────────────────
// These resolve at build/dev time.  Empty object {} when directories are empty.

const _rawTiles = import.meta.glob('/assets/tiles/*.png', {
  query:  '?url',
  import: 'default',
  eager:  true,
}) as Record<string, string>;

const _rawCritters = import.meta.glob('/assets/sprites/critters/*.png', {
  query:  '?url',
  import: 'default',
  eager:  true,
}) as Record<string, string>;

const _rawCritterMeta = import.meta.glob('/assets/sprites/critters/*.json', {
  query:  '?url',
  import: 'default',
  eager:  true,
}) as Record<string, string>;

const _rawUi = import.meta.glob('/assets/ui/*.png', {
  query:  '?url',
  import: 'default',
  eager:  true,
}) as Record<string, string>;

// ── Stem → URL maps ───────────────────────────────────────────────────────────

function buildStemMap(raw: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, url] of Object.entries(raw)) {
    const file = path.split('/').pop() ?? '';
    const stem = file.replace(/\.(png|json)$/i, '').toLowerCase();
    if (stem) m.set(stem, url);
  }
  return m;
}

export const TILE_MAP     = buildStemMap(_rawTiles);
export const CRITTER_MAP  = buildStemMap(_rawCritters);
export const CRITTER_META = buildStemMap(_rawCritterMeta);
export const UI_MAP       = buildStemMap(_rawUi);

// ── URL pickers ───────────────────────────────────────────────────────────────

/**
 * Return the URL for the first stem in `map` whose name contains any hint
 * (case-insensitive substring match), or null if none match.
 */
function pickByKeyword(map: Map<string, string>, hints: string[]): string | null {
  for (const hint of hints) {
    for (const [stem, url] of map.entries()) {
      if (stem.includes(hint)) return url;
    }
  }
  return null;
}

/**
 * Return the URL for the Nth stem when sorted alphabetically, or null.
 * Useful for numerically-named tiles (0001.png, 0002.png …).
 */
function pickNth(map: Map<string, string>, n: number): string | null {
  const keys = [...map.keys()].sort();
  const key  = keys[n];
  return key !== undefined ? (map.get(key) ?? null) : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type TileRole = 'floor' | 'floor2' | 'floor3' | 'wall' | 'door' | 'roof';

/** Known Fallout 1 FRM stems and keywords for each tile role. */
const TILE_HINTS: Record<TileRole, string[]> = {
  floor:  ['floor', 'flor', 'grd', 'tile', 'vault', 'ground', 'int'],
  floor2: ['floor2', 'flr2', 'cmd', 'green', 'command'],
  floor3: ['floor3', 'flr3', 'grate', 'metal', 'grid'],
  wall:   ['wall', 'wll', 'wlblk', 'brik', 'block'],
  door:   ['door', 'dor', 'gate'],
  roof:   ['roof', 'ceil', 'top', 'cap'],
};

/** Sorted position to use for each role when only numbered tiles exist. */
const TILE_FALLBACK_IDX: Record<TileRole, number> = {
  floor: 0, floor2: 1, floor3: 2, wall: 3, door: 4, roof: 5,
};

/**
 * Return the URL of the best available real tile for the given role,
 * or null if no real tiles are available.
 */
export function tileUrl(role: TileRole): string | null {
  // 1. Keyword match
  const byKw = pickByKeyword(TILE_MAP, TILE_HINTS[role]);
  if (byKw) return byKw;
  // 2. Positional fallback (numbered tiles)
  return pickNth(TILE_MAP, TILE_FALLBACK_IDX[role]);
}

export type SpriteRole = 'player' | 'npc';

/** Known Fallout 1 critter stems for player and NPC roles. */
const CRITTER_HINTS: Record<SpriteRole, string[]> = {
  player: ['haaaa', 'haaa', 'hfmaat', 'vault_dweller', 'player', 'vault', 'hf'],
  npc:    ['haovrnt', 'haovr', 'overseer', 'boss', 'npc', 'haofcr'],
};

/**
 * Return the URL of the best matching critter PNG for the given role,
 * or null if no critter sprites are available.
 */
export function critterUrl(role: SpriteRole): string | null {
  return pickByKeyword(CRITTER_MAP, CRITTER_HINTS[role]);
}

/**
 * Return the URL of the companion metadata JSON for a critter sprite, or null.
 * The JSON contains { cell_width, cell_height, fps, … } from frm_to_png.py.
 */
export function critterMetaUrl(role: SpriteRole): string | null {
  return pickByKeyword(CRITTER_META, CRITTER_HINTS[role]);
}

export const hasTiles     = (): boolean => TILE_MAP.size     > 0;
export const hasCritters  = (): boolean => CRITTER_MAP.size  > 0;

// ── Per-tile index lookup (for real Fallout 1 MAP tile IDs) ───────────────────

/**
 * All tile entries sorted alphabetically by stem.
 * Alphabetical order matches TILES.LST order, so:
 *   Fallout 1 tile ID N in a MAP file → SORTED_TILE_ENTRIES[N] → texture 'tile_idx_N'
 */
export const SORTED_TILE_ENTRIES: [string, string][] =
  [...TILE_MAP.entries()].sort(([a], [b]) => a.localeCompare(b));

/**
 * Return the URL for the Nth tile in alphabetical (= TILES.LST) order, or null.
 * Used by PreloadScene to register `tile_idx_N` texture keys.
 */
export function tileUrlByIndex(n: number): string | null {
  const entry = SORTED_TILE_ENTRIES[n];
  return entry ? entry[1] : null;
}
