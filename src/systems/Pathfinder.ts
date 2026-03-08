/**
 * Pathfinder.ts — A* pathfinding on the isometric tile grid.
 *
 * Only the object layer is checked for passability.
 * OBJ_WALL (10) tiles are impassable; everything else (empty, door, floor) is
 * passable.  The floor layer and roof layer do not affect movement.
 *
 * Returns an array of {col, row} waypoints from start (exclusive) to goal
 * (inclusive), or an empty array if no path exists.
 *
 * Movement is 4-directional (cardinal only) to match Fallout 1's hex-grid feel
 * on an isometric square grid.  Diagonal moves could be added later.
 */

import { MAP_W, MAP_H, OBJ_WALL } from '../utils/constants';
import type { TileGrid } from '../data/vaultMap';

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

// ── 4-directional neighbours ──────────────────────────────────────────────────

const DIRS: readonly [number, number][] = [
  [ 0, -1],   // north
  [ 0,  1],   // south
  [-1,  0],   // west
  [ 1,  0],   // east
];

// ── Manhattan heuristic ───────────────────────────────────────────────────────

function heuristic(col: number, row: number, gc: number, gr: number): number {
  return Math.abs(col - gc) + Math.abs(row - gr);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find a path on the object grid from (startCol, startRow) to (goalCol, goalRow).
 *
 * @param objectGrid  Level's object-layer grid — only OBJ_WALL blocks movement.
 * @returns Array of tile coords from start (exclusive) to goal (inclusive),
 *          or [] if unreachable.
 */
export function findPath(
  objectGrid: TileGrid,
  startCol: number, startRow: number,
  goalCol: number,  goalRow: number,
): TileCoord[] {
  // Trivial case
  if (startCol === goalCol && startRow === goalRow) return [];
  // Goal itself must be passable
  if (objectGrid[goalRow]?.[goalCol] === OBJ_WALL) return [];

  const key = (c: number, r: number): number => r * MAP_W + c;

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();   // key → parent key
  const open = new MinHeap();

  const startKey = key(startCol, startRow);
  gScore.set(startKey, 0);
  open.push({ f: heuristic(startCol, startRow, goalCol, goalRow), col: startCol, row: startRow });

  const closed = new Set<number>();

  while (open.size > 0) {
    const cur = open.pop();
    const curKey = key(cur.col, cur.row);

    if (closed.has(curKey)) continue;
    closed.add(curKey);

    if (cur.col === goalCol && cur.row === goalRow) {
      // Reconstruct path
      const path: TileCoord[] = [];
      let k = curKey;
      while (k !== startKey) {
        const c = k % MAP_W;
        const r = Math.floor(k / MAP_W);
        path.push({ col: c, row: r });
        k = cameFrom.get(k)!;
      }
      path.reverse();
      return path;
    }

    const curG = gScore.get(curKey) ?? Infinity;

    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;

      if (nc < 0 || nc >= MAP_W || nr < 0 || nr >= MAP_H) continue;
      if (objectGrid[nr][nc] === OBJ_WALL) continue;

      const nKey = key(nc, nr);
      if (closed.has(nKey)) continue;

      const tentativeG = curG + 1;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, curKey);
        open.push({ f: tentativeG + heuristic(nc, nr, goalCol, goalRow), col: nc, row: nr });
      }
    }
  }

  return [];   // unreachable
}
