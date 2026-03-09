/**
 * QuestSystem.ts — Pure quest-state management.  No Phaser dependency.
 *
 * All functions mutate the CharacterData.quests array in place;
 * callers must persist the updated charData to the registry.
 */

import type { CharacterData, Quest } from '../utils/types';
import { makeQuest } from '../data/quests';

// ── Activate ──────────────────────────────────────────────────────────────────

/**
 * Add a quest to the character's quest log and set it active.
 * Returns false if the quest is already tracked (any status).
 */
export function activateQuest(char: CharacterData, questId: string): boolean {
  if (char.quests.some(q => q.id === questId)) return false;
  const quest = makeQuest(questId);
  if (!quest) return false;
  quest.status = 'active';
  char.quests.push(quest);
  return true;
}

// ── Stage progress ────────────────────────────────────────────────────────────

/**
 * Mark a specific stage as completed.
 * Returns false if the quest or stage is not found, or the quest isn't active.
 */
export function advanceQuest(
  char: CharacterData,
  questId: string,
  stageId: number,
): boolean {
  const quest = getQuest(char, questId);
  if (!quest || quest.status !== 'active') return false;
  const stage = quest.stages.find(s => s.id === stageId);
  if (!stage || stage.completed) return false;
  stage.completed = true;
  return true;
}

// ── Completion ────────────────────────────────────────────────────────────────

/**
 * Mark the quest completed and return its XP reward (0 if not found).
 * All stages are auto-completed.
 */
export function completeQuest(char: CharacterData, questId: string): number {
  const quest = getQuest(char, questId);
  if (!quest) return 0;
  quest.status = 'completed';
  for (const stage of quest.stages) stage.completed = true;
  return quest.xp_reward;
}

/** Mark the quest as failed. */
export function failQuest(char: CharacterData, questId: string): void {
  const quest = getQuest(char, questId);
  if (quest) quest.status = 'failed';
}

// ── Flag helpers ──────────────────────────────────────────────────────────────

export function setFlag(char: CharacterData, flag: string, value = true): void {
  char.questFlags[flag] = value;
}

export function hasFlag(char: CharacterData, flag: string): boolean {
  return char.questFlags[flag] === true;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getQuest(char: CharacterData, questId: string): Quest | undefined {
  return char.quests.find(q => q.id === questId);
}

export function hasQuest(char: CharacterData, questId: string): boolean {
  return char.quests.some(q => q.id === questId);
}

export function getActiveQuests(char: CharacterData): Quest[] {
  return char.quests.filter(q => q.status === 'active');
}

export function getCompletedQuests(char: CharacterData): Quest[] {
  return char.quests.filter(q => q.status === 'completed');
}

/** Return the current (first uncompleted) stage description of a quest. */
export function currentStageDesc(char: CharacterData, questId: string): string {
  const quest = getQuest(char, questId);
  if (!quest) return '';
  const stage = quest.stages.find(s => !s.completed);
  return stage?.description ?? quest.stages[quest.stages.length - 1]?.description ?? '';
}
