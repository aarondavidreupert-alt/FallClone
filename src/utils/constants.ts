// Game viewport
export const GAME_WIDTH  = 800;
export const GAME_HEIGHT = 600;

// ── Isometric tile geometry ───────────────────────────────────────────────────
// Matches Fallout 1 original tile dimensions: 80 × 36 pixels per diamond.
// The 80:36 ratio gives the classic ~2.2:1 (Fallout-accurate) isometric look.
export const TILE_W  = 80;   // full diamond width
export const TILE_H  = 36;   // full diamond height
export const HALF_W  = 40;   // TILE_W / 2  — used for iso X projection
export const HALF_H  = 18;   // TILE_H / 2  — used for iso Y projection
export const WALL_H  = 36;   // height of the wall front-face in pixels

// ── Map dimensions ────────────────────────────────────────────────────────────
export const MAP_W      = 50;   // tile columns per level
export const MAP_H      = 50;   // tile rows per level
export const NUM_LEVELS = 3;

// ── Tile type IDs — floor layer ───────────────────────────────────────────────
export const T_EMPTY  = 0;   // no tile
export const T_FLOOR  = 1;   // standard vault floor (grey metal)
export const T_FLOOR2 = 2;   // command-centre floor (dark green)
export const T_FLOOR3 = 3;   // heavy metal grating (entrance / armory)

// ── Tile type IDs — object layer ──────────────────────────────────────────────
export const OBJ_WALL = 10;  // solid wall block
export const OBJ_DOOR = 11;  // open door frame (passable, renders as floor gap)

// ── Tile type IDs — roof layer ────────────────────────────────────────────────
export const ROOF_STD = 20;  // standard vault ceiling

// ── Render depth constants ────────────────────────────────────────────────────
// depth = (col + row) * DEPTH_STEP + LAYER_OFFSET[layer]
export const DEPTH_STEP    = 10;
export const DEPTH_FLOOR   = 0;
export const DEPTH_OBJECTS = 5;
export const DEPTH_ROOF    = 100_000;  // always above all world geometry

// ── Texture cache keys ────────────────────────────────────────────────────────
export const TX_FLOOR  = 'tx_floor';
export const TX_FLOOR2 = 'tx_floor2';
export const TX_FLOOR3 = 'tx_floor3';
export const TX_WALL   = 'tx_wall';
export const TX_DOOR   = 'tx_door';
export const TX_ROOF   = 'tx_roof';
export const TX_PLAYER = 'tx_player';
export const TX_NPC    = 'tx_npc';
