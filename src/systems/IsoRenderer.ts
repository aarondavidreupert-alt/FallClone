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

/** Whether (col, row) is within the map grid. */
export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < MAP_W && row >= 0 && row < MAP_H;
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
export function mapWorldBounds(): {
  x: number; y: number; width: number; height: number;
} {
  // Leftmost point: tile (0, MAP_H-1) — top-left corner of the diamond
  const leftX   = (0 - (MAP_H - 1)) * HALF_W - HALF_W;
  // Rightmost point: tile (MAP_W-1, 0) + half tile width
  const rightX  = (MAP_W - 1) * HALF_W + HALF_W;
  // Topmost point: tile (0, 0) — minus a little padding
  const topY    = -HALF_H;
  // Bottommost point: tile (MAP_W-1, MAP_H-1) + full tile height + wall height
  const bottomY = (MAP_W - 1 + MAP_H - 1) * HALF_H + TILE_H + WALL_H;

  const pad = 64;
  return {
    x:      leftX  - pad,
    y:      topY   - pad,
    width:  rightX - leftX  + pad * 2,
    height: bottomY - topY  + pad * 2,
  };
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
