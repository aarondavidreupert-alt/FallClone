/**
 * IsoRenderer.ts — Isometric coordinate utilities for the Fallout 1 clone.
 *
 * Coordinate system
 * -----------------
 * Grid  (col, row) : tile address, col = right-diagonal, row = left-diagonal
 * World (x, y)     : Phaser world-space pixels (Y grows downward)
 *
 * Projection (matches Fallout 1's ~2.2:1 isometric ratio):
 *   worldX = (col - row) * HALF_W          HALF_W = 40
 *   worldY = (col + row) * HALF_H          HALF_H = 18
 *
 * Tile sprites use setOrigin(0.5, 0), so the sprite anchor sits at the TOP
 * vertex of the isometric diamond.  All world positions returned here refer
 * to that top vertex.
 *
 * Render depth (painter's algorithm / Y-sort):
 *   Tiles further "into" the screen have smaller (col+row) → smaller depth
 *   → drawn first → appear behind nearer tiles.  Layer offsets ensure floor
 *   always underlies objects, and roof always overlies everything.
 */

import {
  HALF_W, HALF_H,
  TILE_W, TILE_H,
  WALL_H,
  MAP_W, MAP_H,
  DEPTH_STEP, DEPTH_FLOOR, DEPTH_OBJECTS, DEPTH_ROOF,
} from '../utils/constants';

// ── Forward / inverse projection ──────────────────────────────────────────────

/** Tile grid → world pixel position (top vertex of the iso diamond). */
export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  };
}

/** World pixel → nearest tile grid position. */
export function worldToTile(wx: number, wy: number): { col: number; row: number } {
  // Inverse of the projection matrix
  const col = Math.round((wx / HALF_W + wy / HALF_H) / 2);
  const row = Math.round((wy / HALF_H - wx / HALF_W) / 2);
  return { col, row };
}

/** Whether (col, row) is within the map grid (defaults to MAP_W × MAP_H). */
export function inBounds(col: number, row: number, mapW = MAP_W, mapH = MAP_H): boolean {
  return col >= 0 && col < mapW && row >= 0 && row < mapH;
}

// ── Depth / draw order ────────────────────────────────────────────────────────

/**
 * Render depth for a tile at (col, row) on a given layer.
 *
 * layer 0 = floor   → DEPTH_FLOOR   offset (smallest — drawn first)
 * layer 1 = objects → DEPTH_OBJECTS offset (drawn over floor)
 * layer 2 = roof    → DEPTH_ROOF    offset (always topmost)
 */
export function tileDepth(col: number, row: number, layer: 0 | 1 | 2): number {
  const base = (col + row) * DEPTH_STEP;
  if (layer === 2) return DEPTH_ROOF + base;
  if (layer === 1) return base + DEPTH_OBJECTS;
  return base + DEPTH_FLOOR;
}

// ── World bounds ──────────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box of the entire isometric map in world space,
 * with generous padding so the camera never sees the void.
 *
 * Used by LocationScene to clamp the camera:
 *   camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height)
 */
export function mapWorldBounds(mapW = MAP_W, mapH = MAP_H): {
  x: number; y: number; width: number; height: number;
} {
  // Leftmost point: tile (0, mapH-1)
  const leftX   = (0 - (mapH - 1)) * HALF_W - HALF_W;
  // Rightmost point: tile (mapW-1, 0)
  const rightX  = (mapW - 1) * HALF_W + HALF_W;
  // Topmost point: tile (0, 0)
  const topY    = -HALF_H;
  // Bottommost point: tile (mapW-1, mapH-1) + tile height + wall height
  const bottomY = (mapW - 1 + mapH - 1) * HALF_H + TILE_H + WALL_H;

  const pad = 64;
  return {
    x:      leftX  - pad,
    y:      topY   - pad,
    width:  rightX - leftX  + pad * 2,
    height: bottomY - topY  + pad * 2,
  };
}

// ── Fallout 1 hex coordinate system ──────────────────────────────────────────

/**
 * Stride of Fallout 1's internal 200×200 hex grid.
 * Every object/player position is encoded as:  pos = row * HEX_STRIDE + col
 *
 * The visible tile array in a MAP file is 100×100 (10 000 tiles per elevation).
 * Tile[i] sits at hex_pos = (i / 100) * HEX_STRIDE + (i % 100).
 */
export const HEX_STRIDE = 200;

/** Decode a flat Fallout 1 hex position → (col, row). */
export function hexPosToColRow(pos: number): { col: number; row: number } {
  return { col: pos % HEX_STRIDE, row: Math.floor(pos / HEX_STRIDE) };
}

/** Encode (col, row) → flat Fallout 1 hex position. */
export function colRowToHexPos(col: number, row: number): number {
  return row * HEX_STRIDE + col;
}

/**
 * Exact Fallout 1 oblique-hex tile formula.
 *
 * Returns the bounding-box upper-left corner of the 80×36 tile image in world
 * space.  Use with `add.image(x, y, key).setOrigin(0, 0)` for real-map tiles.
 *
 * col / row are positions in the 100×100 tile array (tile_col = i%100, tile_row = i/100).
 *
 * Constants come from the Fallout 1 engine source (reciprocal of TILES.LST order):
 *   x = -48 − col×48 + row×32
 *   y =  −3 + col×12 + row×24
 */
export function fallout1TileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: -48 - col * 48 + row * 32,
    y:  -3 + col * 12 + row * 24,
  };
}

/**
 * Inverse of fallout1TileToWorld — world pixel → nearest tile (col, row).
 * Uses the matrix inverse of the 2×2 projection.
 *
 * det(A) = (−48)(24) − (32)(12) = −1536
 * col = (−3·wx + 4·wy − 132) / 192
 * row = ( 1·wx + 4·wy +  60) / 128
 */
export function worldToTileCoord(wx: number, wy: number): { col: number; row: number } {
  return {
    col: Math.round((-3 * wx + 4 * wy - 132) / 192),
    row: Math.round((     wx + 4 * wy +  60) / 128),
  };
}

/**
 * Camera bounds for the Fallout 1 oblique projection over a 100×100 tile map.
 * Derived from the extremes of fallout1TileToWorld across the tile grid.
 */
export function fallout1MapWorldBounds(mapW = 100, mapH = 100): {
  x: number; y: number; width: number; height: number;
} {
  // Leftmost x:  col = mapW-1, row = 0 → x = -48 − (mapW−1)×48
  const xMin = -48 - (mapW - 1) * 48;
  // Rightmost x: col = 0,      row = mapH-1 → x = -48 + (mapH−1)×32 + TILE_W (sprite extent)
  const xMax = -48 + (mapH - 1) * 32 + TILE_W;
  // Topmost y:   col = 0,      row = 0 → y = -3
  const yMin = -3;
  // Bottommost y: col = mapW-1, row = mapH-1 → y = -3 + (mapW-1)×12 + (mapH-1)×24 + TILE_H
  const yMax = -3 + (mapW - 1) * 12 + (mapH - 1) * 24 + TILE_H;
  const pad  = 64;
  return {
    x:      xMin - pad,
    y:      yMin - pad,
    width:  xMax - xMin + pad * 2,
    height: yMax - yMin + pad * 2,
  };
}

/**
 * Fallout 1 hex position → world pixel coordinates.
 *
 * Uses the exact Fallout 1 oblique-hex formula — a 2:1 finer-resolution
 * version of fallout1TileToWorld (two hex steps = one tile step):
 *   x = −48 − hexCol×24 + hexRow×16
 *   y =  −3 + hexCol× 6 + hexRow×12
 *
 * Returns the bounding-box upper-left of the hex cell in world space.
 */
export function hexToWorld(pos: number): { x: number; y: number } {
  const hexCol = pos % HEX_STRIDE;
  const hexRow = Math.floor(pos / HEX_STRIDE);
  return {
    x: -48 - hexCol * 24 + hexRow * 16,
    y:  -3 + hexCol *  6 + hexRow * 12,
  };
}

/**
 * World pixel → nearest Fallout 1 hex position.
 * Matrix inverse of hexToWorld:
 *   det = −384
 *   hexCol = −(12·(wx+48) − 16·(wy+3)) / 384
 *   hexRow =  ( 6·(wx+48) + 24·(wy+3)) / 384
 */
export function worldToHex(wx: number, wy: number): number {
  const hexCol = Math.round(-(12 * (wx + 48) - 16 * (wy + 3)) / 384);
  const hexRow = Math.round( ( 6 * (wx + 48) + 24 * (wy + 3)) / 384);
  const c = Math.max(0, Math.min(HEX_STRIDE - 1, hexCol));
  const r = Math.max(0, Math.min(HEX_STRIDE - 1, hexRow));
  return colRowToHexPos(c, r);
}

/**
 * Return the up-to-6 valid hex neighbours of `pos` in Fallout 1's hex grid.
 *
 * Uses a staggered-row offset grid (even rows are left-aligned):
 *   Even row offsets (dcol, drow): (-1,-1),(0,-1),(1,0),(0,1),(-1,1),(-1,0)
 *   Odd  row offsets (dcol, drow):  (0,-1),(1,-1),(1,0),(1,1),(0,1), (-1,0)
 *
 * Neighbours that would fall outside [0, HEX_STRIDE) in either axis are
 * omitted from the result.
 */
export function hexNeighbors(pos: number): number[] {
  const { col, row } = hexPosToColRow(pos);
  const offsets: readonly [number, number][] = (row & 1) === 0
    ? [[-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]]
    : [[ 0, -1], [1, -1], [1, 0], [1, 1], [ 0, 1], [-1, 0]];

  const result: number[] = [];
  for (const [dc, dr] of offsets) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc >= 0 && nc < HEX_STRIDE && nr >= 0 && nr < HEX_STRIDE) {
      result.push(colRowToHexPos(nc, nr));
    }
  }
  return result;
}

// ── Tile geometry helpers ─────────────────────────────────────────────────────

/**
 * The four vertices of an isometric floor diamond in local texture space
 * (top-left of the texture bounding-box at 0,0).
 * Used for drawing tile textures and for mouse-hit testing.
 */
export const DIAMOND_POINTS = [
  { x: HALF_W,     y: 0       },   // top
  { x: TILE_W,     y: HALF_H  },   // right
  { x: HALF_W,     y: TILE_H  },   // bottom
  { x: 0,          y: HALF_H  },   // left
] as const;

/**
 * The six vertices of an isometric wall box (top face + front two faces)
 * in local texture space.  Total sprite height = TILE_H + WALL_H.
 */
export const wallBoxPoints = {
  topFace: [
    { x: HALF_W, y: 0         },
    { x: TILE_W, y: HALF_H    },
    { x: HALF_W, y: TILE_H    },
    { x: 0,      y: HALF_H    },
  ],
  leftFace: [
    { x: 0,      y: HALF_H              },
    { x: HALF_W, y: TILE_H             },
    { x: HALF_W, y: TILE_H + WALL_H    },
    { x: 0,      y: HALF_H  + WALL_H   },
  ],
  rightFace: [
    { x: HALF_W, y: TILE_H             },
    { x: TILE_W, y: HALF_H             },
    { x: TILE_W, y: HALF_H  + WALL_H   },
    { x: HALF_W, y: TILE_H + WALL_H    },
  ],
  // Silhouette outline (clockwise from top vertex)
  outline: [
    { x: HALF_W, y: 0                  },
    { x: TILE_W, y: HALF_H             },
    { x: TILE_W, y: HALF_H  + WALL_H   },
    { x: HALF_W, y: TILE_H + WALL_H    },
    { x: 0,      y: HALF_H  + WALL_H   },
    { x: 0,      y: HALF_H             },
  ],
} as const;
