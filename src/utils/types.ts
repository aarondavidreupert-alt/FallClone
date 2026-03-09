// Core type definitions used across all systems

export interface Vector2 {
  x: number;
  y: number;
}

export interface HexCoord {
  q: number;
  r: number;
}

export type DamageType = 'normal' | 'fire' | 'plasma' | 'electrical' | 'emp' | 'explosive' | 'poison' | 'radiation';

export type BodyPart = 'torso' | 'head' | 'eyes' | 'groin' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export type EquipSlot = 'armor' | 'weapon';

export interface SPECIAL {
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;
}

export interface GameState {
  player: CharacterData | null;
  currentMap: string | null;
  currentLevel: number;
  playTime: number;
}

export interface CharacterData {
  id: string;
  name: string;
  special: SPECIAL;
  skills: Record<string, number>;
  traits: string[];
  perks: string[];
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  ap: number;
  max_ap: number;
  karma: number;
  inventory: ItemInstance[];
  equipped: {
    armor: string | null;
    weapon: string | null;
  };
  // Phase 8 additions
  quests:         Quest[];
  questFlags:     Record<string, boolean>;
  days:           number;
  worldUnlocked:  boolean;
}

export interface ItemInstance {
  id: string;
  quantity: number;
}

// ── Dialogue types ────────────────────────────────────────────────────────────

export interface DialogueSkillCheck {
  skill:      string;
  difficulty: number;
}

export interface DialogueResponse {
  text:        string;
  next:        string;           // node id, or "end" to close dialogue
  skill_check: DialogueSkillCheck | null;
}

export interface DialogueNode {
  id:        string;
  text:      string;
  responses: DialogueResponse[];
}

export interface DialogueFile {
  npc_id:   string;
  npc_name: string;
  nodes:    DialogueNode[];
}

// ── Quest types ───────────────────────────────────────────────────────────────

export interface QuestStage {
  id:          number;
  description: string;
  completed:   boolean;
}

export interface Quest {
  id:               string;
  name:             string;
  description:      string;
  status:           'inactive' | 'active' | 'completed' | 'failed';
  stages:           QuestStage[];
  xp_reward:        number;
  time_limit_days?: number;
}
