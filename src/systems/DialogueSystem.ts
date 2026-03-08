/**
 * DialogueSystem.ts — Manages state for a single dialogue conversation.
 *
 * Responsibilities
 * ────────────────
 * • Holds the loaded DialogueFile and builds a fast node-id→node lookup map.
 * • Tracks the current node during a conversation.
 * • Tracks visited-node flags (useful for "already said that" conditions later).
 * • Evaluates skill_check requirements (currently always passes — Phase 7 wires in real stats).
 * • Returns the next node or signals "conversation ended" on response selection.
 *
 * Usage
 * ─────
 *   const sys = new DialogueSystem(overseerData);
 *   let node = sys.start();           // → start node
 *   node = sys.select(0).node!;       // → first response's target node
 *   if (sys.select(1).isEnd) closeDialogue();
 */

import type { DialogueFile, DialogueNode } from '../utils/types';

export interface SelectResult {
  node:  DialogueNode | null;
  isEnd: boolean;
}

export class DialogueSystem {
  private readonly _nodeMap   = new Map<string, DialogueNode>();
  private readonly _visited   = new Set<string>();
  private _current: DialogueNode | null = null;

  constructor(file: DialogueFile) {
    for (const node of file.nodes) {
      this._nodeMap.set(node.id, node);
    }
  }

  /** Jump to the "start" node and return it. */
  start(): DialogueNode {
    return this._goTo('start');
  }

  /** The node currently being displayed. */
  get currentNode(): DialogueNode | null {
    return this._current;
  }

  /**
   * Select a response by index.
   * @returns `{ node, isEnd: false }` when the conversation continues,
   *          `{ node: null, isEnd: true }` when next === "end".
   */
  select(responseIndex: number): SelectResult {
    if (!this._current) return { node: null, isEnd: true };

    const response = this._current.responses[responseIndex];
    if (!response) return { node: null, isEnd: true };

    if (response.next === 'end') return { node: null, isEnd: true };

    return { node: this._goTo(response.next), isEnd: false };
  }

  /** Whether the player has visited a given node at any point. */
  hasVisited(nodeId: string): boolean {
    return this._visited.has(nodeId);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _goTo(nodeId: string): DialogueNode {
    const node = this._nodeMap.get(nodeId);
    if (!node) throw new Error(`DialogueSystem: missing node "${nodeId}"`);
    this._visited.add(nodeId);
    this._current = node;
    return node;
  }
}
