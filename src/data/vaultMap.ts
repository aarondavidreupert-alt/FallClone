/**
 * vaultMap.ts — Procedurally-generated Vault 13 stand-in map.
 *
 * Produces three levels of a vault interior using tile-type constants only.
 * No image assets required — the renderer uses programmatically-generated
 * placeholder textures (see PreloadScene).
 *
 * When real MAP/FRM assets are available (Phase 1 pipeline), this module
 * is replaced by a loader that reads assets/maps/v13ent.json.
 *
 * Coordinate convention
 * ─────────────────────
 * grid[row][col]  (row 0 = top of map, col 0 = left of map)
 *
 * Level overview
 * ──────────────
 * Level 0 — Entrance:  vault door bay, central hub, overseer's suite,
 *                       medical bay, armory
 * Level 1 — Residential: corridor spine, two residential wings, dining hall,
 *                         hydroponics
 * Level 2 — Engineering: generator room, water-chip room (green), machinery,
 *                         lower storage
 */

import {
  MAP_W, MAP_H,
  T_EMPTY, T_FLOOR, T_FLOOR2, T_FLOOR3,
  OBJ_WALL, OBJ_DOOR,
  ROOF_STD,
} from '../utils/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TileGrid = number[][];   // grid[row][col]

export interface GroundItemSpawn {
  readonly itemId:   string;
  readonly quantity: number;
  readonly col:      number;
  readonly row:      number;
}

export interface LevelData {
  readonly name:   string;
  readonly floor:  TileGrid;   // ground layer
  readonly object: TileGrid;   // walls / doors
  readonly roof:   TileGrid;   // ceiling
  readonly playerStart: { col: number; row: number };
  readonly items:  readonly GroundItemSpawn[];   // items on the ground
  /** Raw Fallout 1 floor tile IDs per cell (0 = empty). Only set for real maps. */
  readonly tileIds?: TileGrid;
}

export interface VaultMapData {
  readonly mapId:  string;
  readonly name:   string;
  readonly width:  number;
  readonly height: number;
  readonly levels: readonly LevelData[];
  /** 'fallout1' when loaded from a real MAP file; 'procedural' otherwise. */
  readonly mapType?: 'procedural' | 'fallout1';
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function makeGrid(fill = T_EMPTY): TileGrid {
  return Array.from({ length: MAP_H }, () => new Array<number>(MAP_W).fill(fill));
}

function set(grid: TileGrid, row: number, col: number, val: number): void {
  if (row >= 0 && row < MAP_H && col >= 0 && col < MAP_W) grid[row][col] = val;
}

// ── Room builder ──────────────────────────────────────────────────────────────

interface Room {
  c0: number; r0: number;   // top-left corner (inclusive)
  c1: number; r1: number;   // bottom-right corner (inclusive)
  floorType: number;
  hasCeiling: boolean;
}

interface DoorSpec {
  row: number;
  col: number;
}

/**
 * Carve a room into the three grids.
 * Interior = floor + ceiling.  Perimeter = wall objects (no floor beneath).
 */
function carveRoom(
  floor: TileGrid, object: TileGrid, roof: TileGrid,
  room: Room,
): void {
  for (let r = room.r0; r <= room.r1; r++) {
    for (let c = room.c0; c <= room.c1; c++) {
      const perimeter =
        r === room.r0 || r === room.r1 || c === room.c0 || c === room.c1;

      if (perimeter) {
        set(object, r, c, OBJ_WALL);
      } else {
        set(floor,  r, c, room.floorType);
        if (room.hasCeiling) set(roof, r, c, ROOF_STD);
      }
    }
  }
}

/**
 * Replace a perimeter wall with a door object + floor tile beneath it.
 * Typically called twice to punch a 2-tile-wide opening.
 */
function carveDoor(
  floor: TileGrid, object: TileGrid, floorType: number,
  spec: DoorSpec,
): void {
  set(object, spec.row, spec.col, OBJ_DOOR);
  set(floor,  spec.row, spec.col, floorType);
}

// ── Level generators ──────────────────────────────────────────────────────────

/** Level 0 — Entrance level */
function buildLevel0(): LevelData {
  const floor  = makeGrid();
  const object = makeGrid();
  const roof   = makeGrid();

  const rooms: Room[] = [
    // Vault door bay (heavy metal floor, no ceiling — open shaft above)
    { c0: 21, r0: 4,  c1: 28, r1: 10, floorType: T_FLOOR3, hasCeiling: false },
    // Central hub (main open area connecting all wings)
    { c0: 20, r0: 11, c1: 30, r1: 28, floorType: T_FLOOR,  hasCeiling: true  },
    // Overseer's suite (east — command-centre floor)
    { c0: 31, r0: 11, c1: 43, r1: 24, floorType: T_FLOOR2, hasCeiling: true  },
    // Medical bay (west)
    { c0: 7,  r0: 11, c1: 19, r1: 24, floorType: T_FLOOR,  hasCeiling: true  },
    // Armory (south — metal floor)
    { c0: 22, r0: 30, c1: 28, r1: 38, floorType: T_FLOOR3, hasCeiling: true  },
  ];

  for (const room of rooms) carveRoom(floor, object, roof, room);

  // ── Connections / doors ───────────────────────────────────────────────────

  // Vault bay → hub: clear the shared south-wall of bay / north-wall of hub
  // (bay r1=10, hub r0=11 → they share row 10/11 seam; punch cols 23-26)
  for (let c = 23; c <= 26; c++) {
    carveDoor(floor, object, T_FLOOR3, { row: 10, col: c });
    carveDoor(floor, object, T_FLOOR,  { row: 11, col: c });
  }

  // Hub → Overseer (east): door at col 30-31, rows 17-18
  carveDoor(floor, object, T_FLOOR,  { row: 17, col: 30 });
  carveDoor(floor, object, T_FLOOR,  { row: 18, col: 30 });
  carveDoor(floor, object, T_FLOOR2, { row: 17, col: 31 });
  carveDoor(floor, object, T_FLOOR2, { row: 18, col: 31 });

  // Hub → Medical (west): door at col 19-20, rows 17-18
  carveDoor(floor, object, T_FLOOR,  { row: 17, col: 20 });
  carveDoor(floor, object, T_FLOOR,  { row: 18, col: 20 });
  carveDoor(floor, object, T_FLOOR,  { row: 17, col: 19 });
  carveDoor(floor, object, T_FLOOR,  { row: 18, col: 19 });

  // Hub → Armory (south): door at rows 28-30, cols 24-25
  for (let r = 28; r <= 30; r++) {
    carveDoor(floor, object, T_FLOOR, { row: r, col: 24 });
    carveDoor(floor, object, T_FLOOR, { row: r, col: 25 });
  }

  return {
    name: 'Level 0 — Entrance', floor, object, roof,
    playerStart: { col: 25, row: 13 },
    items: [
      // Medical bay: stimpaks and radaway
      { itemId: 'stimpak',       quantity: 3,  col: 10, row: 14 },
      { itemId: 'stimpak',       quantity: 2,  col: 11, row: 18 },
      { itemId: 'rad_away',      quantity: 1,  col: 10, row: 20 },
      // Armory: weapons and ammo
      { itemId: 'pistol_10mm',   quantity: 1,  col: 24, row: 33 },
      { itemId: 'ammo_10mm',     quantity: 24, col: 24, row: 35 },
      { itemId: 'shotgun',       quantity: 1,  col: 26, row: 33 },
      { itemId: 'ammo_shotgun',  quantity: 12, col: 26, row: 35 },
      { itemId: 'combat_knife',  quantity: 1,  col: 25, row: 36 },
      // Overseer's suite: misc items
      { itemId: 'caps',          quantity: 150, col: 34, row: 14 },
      { itemId: 'rope',          quantity: 1,   col: 42, row: 14 },
    ],
  };
}

/** Level 1 — Residential */
function buildLevel1(): LevelData {
  const floor  = makeGrid();
  const object = makeGrid();
  const roof   = makeGrid();

  const rooms: Room[] = [
    // Central corridor spine
    { c0: 23, r0: 4,  c1: 27, r1: 38, floorType: T_FLOOR,  hasCeiling: true },
    // Residential wing A (west)
    { c0: 7,  r0: 4,  c1: 22, r1: 18, floorType: T_FLOOR,  hasCeiling: true },
    // Residential wing B (east)
    { c0: 28, r0: 4,  c1: 43, r1: 18, floorType: T_FLOOR,  hasCeiling: true },
    // Dining hall
    { c0: 11, r0: 20, c1: 39, r1: 30, floorType: T_FLOOR,  hasCeiling: true },
    // Hydroponics (south — green floor)
    { c0: 14, r0: 32, c1: 36, r1: 42, floorType: T_FLOOR2, hasCeiling: true },
  ];

  for (const room of rooms) carveRoom(floor, object, roof, room);

  // Corridor → Residential A: cols 22-23, rows 8-9
  for (let r = 8; r <= 9; r++) {
    carveDoor(floor, object, T_FLOOR, { row: r, col: 22 });
    carveDoor(floor, object, T_FLOOR, { row: r, col: 23 });
  }

  // Corridor → Residential B: cols 27-28, rows 8-9
  for (let r = 8; r <= 9; r++) {
    carveDoor(floor, object, T_FLOOR, { row: r, col: 27 });
    carveDoor(floor, object, T_FLOOR, { row: r, col: 28 });
  }

  // Corridor → Dining hall: cols 24-26, rows 19-20
  for (let c = 24; c <= 26; c++) {
    carveDoor(floor, object, T_FLOOR, { row: 19, col: c });
    carveDoor(floor, object, T_FLOOR, { row: 20, col: c });
  }

  // Dining hall → Hydroponics: cols 24-26, rows 30-32
  for (let c = 24; c <= 26; c++) {
    carveDoor(floor, object, T_FLOOR,  { row: 30, col: c });
    carveDoor(floor, object, T_FLOOR2, { row: 32, col: c });
  }

  return {
    name: 'Level 1 — Residential', floor, object, roof,
    playerStart: { col: 25, row: 10 },
    items: [
      // Dining hall: food items
      { itemId: 'iguana_on_stick', quantity: 2, col: 15, row: 24 },
      { itemId: 'water_flask',     quantity: 1, col: 20, row: 26 },
      // Residential wing: stimpak and brass knuckles
      { itemId: 'stimpak',         quantity: 1, col: 10, row: 8  },
      { itemId: 'brass_knuckles',  quantity: 1, col: 35, row: 8  },
      { itemId: 'leather_jacket',  quantity: 1, col: 38, row: 12 },
    ],
  };
}

/** Level 2 — Engineering */
function buildLevel2(): LevelData {
  const floor  = makeGrid();
  const object = makeGrid();
  const roof   = makeGrid();

  const rooms: Room[] = [
    // Central access corridor
    { c0: 23, r0: 4,  c1: 27, r1: 38, floorType: T_FLOOR,  hasCeiling: true },
    // Generator room (west — heavy metal floor)
    { c0: 7,  r0: 4,  c1: 22, r1: 22, floorType: T_FLOOR3, hasCeiling: true },
    // WATER CHIP room — the critical location (green tech floor)
    { c0: 24, r0: 6,  c1: 34, r1: 16, floorType: T_FLOOR2, hasCeiling: true },
    // Machinery bay (east)
    { c0: 29, r0: 4,  c1: 43, r1: 22, floorType: T_FLOOR3, hasCeiling: true },
    // Lower storage (full width)
    { c0: 9,  r0: 25, c1: 41, r1: 36, floorType: T_FLOOR,  hasCeiling: true },
  ];

  for (const room of rooms) carveRoom(floor, object, roof, room);

  // Corridor → Generator: cols 22-23, rows 10-11
  for (let r = 10; r <= 11; r++) {
    carveDoor(floor, object, T_FLOOR3, { row: r, col: 22 });
    carveDoor(floor, object, T_FLOOR3, { row: r, col: 23 });
  }

  // Corridor → Water chip room (north entrance): cols 24-26, rows 5-6
  for (let c = 24; c <= 26; c++) {
    carveDoor(floor, object, T_FLOOR2, { row: 5,  col: c });
    carveDoor(floor, object, T_FLOOR2, { row: 6,  col: c });
  }

  // Corridor → Machinery: cols 27-28-29, rows 10-11
  for (let r = 10; r <= 11; r++) {
    carveDoor(floor, object, T_FLOOR3, { row: r, col: 27 });
    carveDoor(floor, object, T_FLOOR3, { row: r, col: 28 });
    carveDoor(floor, object, T_FLOOR3, { row: r, col: 29 });
  }

  // Corridor → Lower storage: cols 24-26, rows 25-26
  for (let c = 24; c <= 26; c++) {
    carveDoor(floor, object, T_FLOOR, { row: 25, col: c });
    carveDoor(floor, object, T_FLOOR, { row: 26, col: c });
  }

  return {
    name: 'Level 2 — Engineering', floor, object, roof,
    playerStart: { col: 25, row: 30 },
    items: [
      // Water chip room: key item area
      { itemId: 'super_stimpak',  quantity: 2, col: 27, row: 11 },
      { itemId: 'rad_away',       quantity: 2, col: 31, row: 10 },
      { itemId: 'metal_armor',    quantity: 1, col: 30, row: 14 },
      // Generator room: weapon
      { itemId: 'hunting_rifle',  quantity: 1, col: 10, row: 12 },
      { itemId: 'ammo_10mm',      quantity: 36, col: 12, row: 14 },
      // Lower storage: misc
      { itemId: 'caps',           quantity: 300, col: 15, row: 30 },
      { itemId: 'spear',          quantity: 1,   col: 35, row: 30 },
    ],
  };
}

// ── Public export ─────────────────────────────────────────────────────────────

/** Build and return the complete Vault 13 map data for all three levels. */
export function buildVaultMap(): VaultMapData {
  return {
    mapId:  'vault13',
    name:   'Vault 13',
    width:  MAP_W,
    height: MAP_H,
    levels: [buildLevel0(), buildLevel1(), buildLevel2()],
  };
}
