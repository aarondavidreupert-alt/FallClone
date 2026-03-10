/**
 * Pathfinder.ts — A* pathfinding on hex and square tile grids.
 *
 * Grid-based (findPath)
 * ─────────────────────
 * Operates on a 2D TileGrid (object layer).  OBJ_WALL tiles are impassable.
 * Uses 6-directional hex neighbours (matching Fallout 1's staggered hex grid)
 * instead of 4-directional cardinal movement for more natural paths.
 *
 * Hex-position-based (findHexPath)
 * ─────────────────────────────────
 * Operates on a Set of blocked Fallout 1 flat hex positions (row*200+col).
 * Used by RealMapLoader-derived maps where collision data comes from objects
 * rather than a 2D grid.
 *
 * Both functions return arrays of {col, row} or hex-position waypoints from
 * start (exclusive) to goal (inclusive), or [] if the goal is unreachable.
 */

import { OBJ_WALL } from '../utils/constants';
import type { TileGrid } from '../data/vaultMap';
import { hexNeighbors, hexPosToColRow, colRowToHexPos } from './IsoRenderer';

export interface TileCoord {
  col: number;
  row: number;
}

// ── Priority queue (min-heap) ─────────────────────────────────────────────────

interface HeapNode {
  f: number;
  col: number;
  row: number;
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number { return this.data.length; }

  push(node: HeapNode): void {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      let min = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[min].f) min = l;
      if (r < n && this.data[r].f < this.data[min].f) min = r;
      if (min === i) break;
      [this.data[min], this.data[i]] = [this.data[i], this.data[min]];
      i = min;
    }
  }
}

// ── Hex neighbour offsets (staggered-row offset grid) ─────────────────────────

/**
 * Hex neighbours for a tile at (col, row) in a 2D grid.
 * Even rows: dcol/drow = (-1,-1),(0,-1),(1,0),(0,1),(-1,1),(-1,0)
 * Odd  rows: dcol/drow =  (0,-1),(1,-1),(1,0),(1,1),(0,1), (-1,0)
 */
function hexDirs(row: number): readonly [number, number][] {
  return (row & 1) === 0
    ? [[-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]]
    : [[ 0, -1], [1, -1], [1, 0], [1, 1], [ 0, 1], [-1, 0]];
}

// ── Admissible heuristic (Chebyshev — works for hex 6-dir) ───────────────────

function hexH(col: number, row: number, gc: number, gr: number): number {
  return Math.max(Math.abs(col - gc), Math.abs(row - gr));
}

// ── Grid-based A* (TileGrid, 6-directional hex) ───────────────────────────────

/**
 * Find a path on the object grid from (startCol, startRow) to (goalCol, goalRow).
 * Uses 6-directional hex movement; grid dimensions are derived from the grid itself.
 *
 * @param objectGrid  Level's object-layer grid — OBJ_WALL tiles block movement.
 * @returns {col,row} waypoints from start (exclusive) to goal (inclusive), or [].
 */
export function findPath(
  objectGrid: TileGrid,
  startCol: number, startRow: number,
  goalCol: number,  goalRow: number,
): TileCoord[] {
  if (startCol === goalCol && startRow === goalRow) return [];
  if (objectGrid[goalRow]?.[goalCol] === OBJ_WALL) return [];

  const gridH = objectGrid.length;
  const gridW = objectGrid[0]?.length ?? 0;
  if (gridW === 0) return [];

  const key = (c: number, r: number): number => r * gridW + c;

  const gScore  = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open    = new MinHeap();
  const closed  = new Set<number>();

  const startKey = key(startCol, startRow);
  gScore.set(startKey, 0);
  open.push({ f: hexH(startCol, startRow, goalCol, goalRow), col: startCol, row: startRow });

  while (open.size > 0) {
    const cur    = open.pop();
    const curKey = key(cur.col, cur.row);

    if (closed.has(curKey)) continue;
    closed.add(curKey);

    if (cur.col === goalCol && cur.row === goalRow) {
      const path: TileCoord[] = [];
      let k = curKey;
      while (k !== startKey) {
        const c = k % gridW;
        const r = Math.floor(k / gridW);
        path.push({ col: c, row: r });
        k = cameFrom.get(k)!;
      }
      path.reverse();
      return path;
    }

    const curG = gScore.get(curKey) ?? Infinity;

    for (const [dc, dr] of hexDirs(cur.row)) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;

      if (nc < 0 || nc >= gridW || nr < 0 || nr >= gridH) continue;
      if (objectGrid[nr][nc] === OBJ_WALL) continue;

      const nKey = key(nc, nr);
      if (closed.has(nKey)) continue;

      const tentativeG = curG + 1;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, curKey);
        open.push({ f: tentativeG + hexH(nc, nr, goalCol, goalRow), col: nc, row: nr });
      }
    }
  }

  return [];
}

// ── Flat-hex-position A* (Set<number> blocked, 6-directional) ─────────────────

/**
 * Find a path on Fallout 1's 200×200 hex grid between two flat hex positions.
 *
 * @param blocked  Set of impassable hex positions (walls, scenery, etc.).
 * @param start    Starting flat hex position (row * HEX_STRIDE + col).
 * @param goal     Goal flat hex position.
 * @returns Array of {col, row} waypoints from start (exclusive) to goal
 *          (inclusive, decoded from hex positions), or [] if unreachable.
 */
export function findHexPath(
  blocked: Set<number>,
  start: number,
  goal: number,
): TileCoord[] {
  if (start === goal) return [];
  if (blocked.has(goal)) return [];

  const { col: gc, row: gr } = hexPosToColRow(goal);

  const heuristic = (pos: number): number => {
    const { col, row } = hexPosToColRow(pos);
    return Math.max(Math.abs(col - gc), Math.abs(row - gr));
  };

  const gScore   = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open     = new MinHeap();
  const closed   = new Set<number>();

  const { col: sc, row: sr } = hexPosToColRow(start);
  gScore.set(start, 0);
  open.push({ f: heuristic(start), col: sc, row: sr });

  while (open.size > 0) {
    const cur    = open.pop();
    const curPos = colRowToHexPos(cur.col, cur.row);

    if (closed.has(curPos)) continue;
    closed.add(curPos);

    if (curPos === goal) {
      const path: TileCoord[] = [];
      let k = curPos;
      while (k !== start) {
        path.push(hexPosToColRow(k));
        k = cameFrom.get(k)!;
      }
      path.reverse();
      return path;
    }

    const curG = gScore.get(curPos) ?? Infinity;

    for (const nb of hexNeighbors(curPos)) {
      if (closed.has(nb) || blocked.has(nb)) continue;
      const tentativeG = curG + 1;
      if (tentativeG < (gScore.get(nb) ?? Infinity)) {
        gScore.set(nb, tentativeG);
        cameFrom.set(nb, curPos);
        const { col: nc, row: nr } = hexPosToColRow(nb);
        open.push({ f: tentativeG + heuristic(nb), col: nc, row: nr });
      }
    }
  }

  return [];
}
