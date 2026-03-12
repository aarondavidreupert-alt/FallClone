/**
 * RealMapLoader.ts — Converts a Fallout 1 MAP JSON (output of map_to_json.py)
 * into a VaultMapData structure for the game engine.
 *
 * MAP JSON format (from tools/map_to_json.py)
 * ────────────────────────────────────────────
 * {
 *   source:    string,          // original .MAP filename
 *   header: {
 *     map_name: string,
 *     player_default: { pos: number, elev: number, rot: number },
 *     ...
 *   },
 *   elevations: [               // 3 elevations (levels)
 *     { width: 100, height: 100, tiles: [{floor, roof}, …] }  // 10 000 tiles
 *   ],
 *   objects: [
 *     { obj_id, hex_pos, elevation, direction, fid, flags,
 *       proto: { type: "wall"|"critter"|"scenery"|"item"|"misc", index },
 *       script_id, owner_id }
 *   ]
 * }
 *
 * Hex coordinate conventions
 * ──────────────────────────
 * hex_pos = row * 200 + col  (Fallout 1 internal 200×200 grid)
 * The 100×100 tile array covers row=0..99, col=0..99 of that grid.
 * For tile index i: col = i % 100, row = i / 100 (integer division).
 * For object hex_pos: col = hex_pos % 200, row = hex_pos / 200.
 *
 * Tile ID mapping
 * ───────────────
 * Raw Fallout 1 floor tile IDs reference the TILES/ FRM art directory.
 * Without the full ID-to-type table we apply a simple heuristic:
 *   floor > 0 → T_FLOOR (standard)
 *   roof  > 0 → ROOF_STD
 * Distinct floor regions (floor2, floor3) can be added when the ID table
 * is available from pro_to_json.py output.
 *
 * Object type mapping
 * ───────────────────
 * proto.type === "wall"    → OBJ_WALL
 * proto.type === "scenery" → OBJ_WALL (treated as blocking)
 * All other types are ignored at this stage.
 */

import {
  T_EMPTY, T_FLOOR, OBJ_WALL, ROOF_STD,
} from '../utils/constants';
import { HEX_STRIDE } from '../systems/IsoRenderer';
import type { VaultMapData, LevelData, TileGrid } from '../data/vaultMap';

// ── MAP JSON types ────────────────────────────────────────────────────────────

interface MapJsonTile {
  floor: number;
  roof:  number;
}

interface MapJsonProto {
  raw:   number;
  type:  string;   // "item"|"critter"|"scenery"|"wall"|"tile"|"misc"
  index: number;
}

interface MapJsonObject {
  obj_id:    number;
  hex_pos:   number;   // row * 200 + col in Fallout 1's 200×200 space
  elevation: number;   // 0–2
  direction: number;
  fid:       { raw: number; type: number; direction: number; frame_num: number; art_idx: number };
  flags:     number;
  proto:     MapJsonProto;
  light:     { radius: number; intensity: number };
  script_id: number;
  owner_id:  number;
}

interface MapJsonElevation {
  width:  number;   // 100
  height: number;   // 100
  tiles:  MapJsonTile[];   // width × height entries
}

export interface MapJson {
  source:     string;
  header: {
    version:        number;
    map_name:       string;
    player_default: { pos: number; elev: number; rot: number };
    lvar_count:     number;
    gvar_count:     number;
    script_type:    string;
    map_id:         number;
    timestamp:      number;
  };
  lvars:      number[];
  gvars:      number[];
  elevations: MapJsonElevation[];
  scripts:    unknown[];
  objects:    MapJsonObject[];
}

// ── Tile array constants ──────────────────────────────────────────────────────

/** Tile array dimensions per elevation (100×100). */
const TILE_W = 100;
const TILE_H = 100;

/** Object types treated as solid walls in the collision grid. */
const BLOCKING_PROTO_TYPES = new Set(['wall', 'scenery']);

// ── Converter ─────────────────────────────────────────────────────────────────

/**
 * Convert a parsed MAP JSON object into the VaultMapData structure used by
 * LocationScene.  Returns null if the JSON is missing or malformed.
 */
export function convertMapJson(json: MapJson | null | undefined): VaultMapData | null {
  if (!json?.elevations?.length) return null;

  // ── Raw structure diagnostic (elevation 0) ─────────────────────────────────
  {
    const elev0 = json.elevations[0];
    const sample = elev0?.tiles?.slice(0, 5) ?? [];
    console.log(
      `[RealMapLoader] Raw JSON — map_name:"${json.header?.map_name}" ` +
      `elevations:${json.elevations.length} ` +
      `elev0: width=${elev0?.width} height=${elev0?.height} tiles=${elev0?.tiles?.length}`,
    );
    console.log('[RealMapLoader] elev0.tiles[0..4]:', JSON.stringify(sample));
  }

  const levelNames = [
    `${json.header.map_name} — Entrance`,
    `${json.header.map_name} — Level 2`,
    `${json.header.map_name} — Level 3`,
  ];

  const levels: LevelData[] = [];

  for (let elevIdx = 0; elevIdx < Math.min(json.elevations.length, 3); elevIdx++) {
    const elev   = json.elevations[elevIdx];
    const tiles  = elev.tiles;
    const tileW  = elev.width  || TILE_W;
    const tileH  = elev.height || TILE_H;

    // Build 2D grids
    const floor:  TileGrid = Array.from({ length: tileH }, () => new Array<number>(tileW).fill(T_EMPTY));
    const object: TileGrid = Array.from({ length: tileH }, () => new Array<number>(tileW).fill(T_EMPTY));
    const roof:   TileGrid = Array.from({ length: tileH }, () => new Array<number>(tileW).fill(T_EMPTY));

    // ── Fill floor / roof from tile array ──────────────────────────────────
    // tileIds preserves the raw Fallout 1 tile index so LocationScene can look
    // up the correct per-tile PNG (tile_idx_N).
    const tileIds: TileGrid = Array.from({ length: tileH },
      () => new Array<number>(tileW).fill(0));

    for (let i = 0; i < tiles.length && i < tileW * tileH; i++) {
      const col = i % tileW;
      const row = Math.floor(i / tileW);
      const t   = tiles[i];
      if (t.floor > 0) {
        floor[row][col]   = T_FLOOR;   // walkability / layer marker
        tileIds[row][col] = t.floor;   // raw Fallout 1 tile ID → texture lookup
      }
      if (t.roof  > 0) roof[row][col] = ROOF_STD;
    }

    // Debug: log unique floor tile IDs so we can verify texture-key mapping
    if (elevIdx === 0) {
      const seen = new Set<number>();
      for (const t of tiles) { if (t.floor > 0) seen.add(t.floor); }
      const first20 = [...seen].slice(0, 20);
      const nonZero = tiles.filter(t => t.floor > 0).length;
      console.log(
        `[RealMapLoader] elev0 — ${nonZero}/${tiles.length} tiles have floor>0; ` +
        `${seen.size} unique IDs`,
      );
      console.log('[RealMapLoader] First 20 unique floor tile IDs:', first20);
      console.log('[RealMapLoader] → texture keys: tile_idx_<id>, e.g. tile_idx_70');
    }

    // ── Fill collision from objects ────────────────────────────────────────
    // Objects use hex_pos with HEX_STRIDE = 200.
    // The tile array covers col 0..99, row 0..99 of that grid.
    for (const obj of json.objects) {
      if (obj.elevation !== elevIdx) continue;
      if (obj.hex_pos < 0)           continue;         // in inventory
      if (!BLOCKING_PROTO_TYPES.has(obj.proto.type)) continue;

      const hexCol = obj.hex_pos % HEX_STRIDE;
      const hexRow = Math.floor(obj.hex_pos / HEX_STRIDE);

      if (hexCol < 0 || hexCol >= tileW || hexRow < 0 || hexRow >= tileH) continue;

      object[hexRow][hexCol] = OBJ_WALL;
      // Ensure a floor tile under every wall for correct visual layering
      if (floor[hexRow][hexCol] === T_EMPTY) floor[hexRow][hexCol] = T_FLOOR;
    }

    // ── Player start ───────────────────────────────────────────────────────
    let playerStart = { col: Math.floor(tileW / 2), row: Math.floor(tileH / 2) };
    if (elevIdx === 0 && json.header.player_default.elev === 0) {
      const pPos  = json.header.player_default.pos;
      const pCol  = pPos % HEX_STRIDE;
      const pRow  = Math.floor(pPos / HEX_STRIDE);
      if (pCol >= 0 && pCol < tileW && pRow >= 0 && pRow < tileH &&
          object[pRow]?.[pCol] !== OBJ_WALL) {
        playerStart = { col: pCol, row: pRow };
      }
    }

    levels.push({
      name:        levelNames[elevIdx] ?? `Level ${elevIdx}`,
      floor, object, roof, tileIds,
      playerStart,
      items: [],
    });
  }

  // Pad to 3 levels if the MAP file had fewer elevations
  while (levels.length < 3) {
    const empH = levels[0]?.floor.length    ?? TILE_H;
    const empW = levels[0]?.floor[0]?.length ?? TILE_W;
    levels.push({
      name:        `Level ${levels.length}`,
      floor:  Array.from({ length: empH }, () => new Array<number>(empW).fill(T_EMPTY)),
      object: Array.from({ length: empH }, () => new Array<number>(empW).fill(T_EMPTY)),
      roof:   Array.from({ length: empH }, () => new Array<number>(empW).fill(T_EMPTY)),
      playerStart: { col: Math.floor(empW / 2), row: Math.floor(empH / 2) },
      items: [],
    });
  }

  const tileW0 = levels[0]?.floor[0]?.length ?? TILE_W;
  const tileH0 = levels[0]?.floor.length    ?? TILE_H;

  return {
    mapId:   json.header.map_name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name:    json.header.map_name,
    width:   tileW0,
    height:  tileH0,
    levels,
    mapType: 'fallout1',
  };
}

/**
 * Try to read a converted MAP JSON from Phaser's JSON cache and return it as
 * VaultMapData.  Returns null if the key is not in the cache or conversion
 * fails (caller should fall back to buildVaultMap()).
 */
export function tryLoadRealMap(
  cacheKey: string,
  jsonCache: Phaser.Cache.BaseCache,
): VaultMapData | null {
  if (!jsonCache.has(cacheKey)) return null;
  try {
    const json = jsonCache.get(cacheKey) as MapJson;
    const result = convertMapJson(json);
    if (result) {
      console.log(
        `[RealMapLoader] Loaded ${json.header.map_name} ` +
        `(${result.width}×${result.height}, ${result.levels.length} levels)`,
      );
    }
    return result;
  } catch (err) {
    console.warn('[RealMapLoader] Conversion failed:', err);
    return null;
  }
}
