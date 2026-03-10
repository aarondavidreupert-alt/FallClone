/**
 * quests.ts — Quest definitions for the Fallout 1 browser clone.
 *
 * Each entry is a template; call makeQuest(id) to get a fresh deep-copy
 * suitable for storing in CharacterData.quests.
 */

import type { Quest } from '../utils/types';

// ── Quest templates ───────────────────────────────────────────────────────────

const QUEST_TEMPLATES: Quest[] = [
  {
    id:          'find_water_chip',
    name:        'Find the Water Chip',
    description: 'The Vault 13 water recycler needs a replacement chip.  Without it everyone dies in 150 days.  Search Vault 15 to the northeast, or ask the water merchants at The Hub.',
    status:      'inactive',
    xp_reward:   1000,
    time_limit_days: 150,
    stages: [
      {
        id:          1,
        description: 'Search for the water chip.  Vault 15 (northeast) or The Hub (south) are your best leads.',
        completed:   false,
      },
      {
        id:          2,
        description: 'Return the water chip to the Overseer.',
        completed:   false,
      },
    ],
  },
  {
    id:          'rescue_initiate',
    name:        'Rescue Initiate From Raiders',
    description: 'Shady Sands has lost a young man to a raider gang.  Investigate the Raiders Camp east of town.',
    status:      'inactive',
    xp_reward:   400,
    stages: [
      {
        id:          1,
        description: 'Find the Raiders Camp and rescue the kidnapped man.',
        completed:   false,
      },
      {
        id:          2,
        description: 'Return the rescued man to Shady Sands.',
        completed:   false,
      },
    ],
  },
  {
    id:          'radscorpion_threat',
    name:        'Stop the Radscorpion Attacks',
    description: 'Radscorpions are attacking Shady Sands.  Hunt them down to protect the town.',
    status:      'inactive',
    xp_reward:   350,
    stages: [
      {
        id:          1,
        description: 'Kill the radscorpions threatening Shady Sands.',
        completed:   false,
      },
    ],
  },
];

// ── Accessors ─────────────────────────────────────────────────────────────────

/** Return a fresh deep-copy of the named quest template, ready to store. */
export function makeQuest(id: string): Quest | undefined {
  const tpl = QUEST_TEMPLATES.find(q => q.id === id);
  if (!tpl) return undefined;
  return JSON.parse(JSON.stringify(tpl)) as Quest;
}

/** All quest ids. */
export function allQuestIds(): string[] {
  return QUEST_TEMPLATES.map(q => q.id);
}
