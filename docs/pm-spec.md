FALLOUT 1 BROWSER CLONE — PM TECHNICAL SPEC
Version 1.0 | Senior PM Technical Specification | Reference this alongside brain_dump.txt
1. OVERVIEW
This document defines the technical architecture, data schemas, system interfaces, and engineering decisions for the Fallout 1 Browser Clone project. It is the authoritative reference for all AI coding agents and developers. Every decision here is final unless explicitly revised in a new version of this document.
2. SYSTEM ARCHITECTURE
The project follows a strict separation of concerns across four layers:

Layer 1 — Asset Pipeline (offline, build-time)
  Python scripts convert raw Fallout 1 assets into web-friendly formats.
  Input: /raw_assets (.FRM, .MAP, .MSG, .PRO, .ACM)
  Output: /assets (.PNG, .JSON, .MP3/.OGG)

Layer 2 — Game Data (JSON)
  All game data (stats, items, maps, dialogue, quests) lives in /assets/data as JSON.
  No hardcoded values anywhere in the TypeScript source.

Layer 3 — Game Engine (Phaser 3 + TypeScript)
  All game logic, rendering, input, and state management.
  Modular system design — each system is an independent class.

Layer 4 — Persistence (Browser)
  Save/load via localStorage (MVP) or IndexedDB (if save size exceeds 5MB).
3. FOLDER STRUCTURE
/project-root
  /src
    /scenes          — Phaser scenes (Boot, Preload, MainMenu, Game, Combat, Dialogue, WorldMap)
    /systems         — Decoupled game systems (Combat, Inventory, Quest, Dialogue, Stats)
    /entities        — Player, NPC, Critter, Item classes
    /ui              — HUD, PipBoy, DialogueBox, InventoryPanel components
    /utils           — Helpers, constants, type definitions
    /loaders         — Asset loaders and data parsers
    main.ts          — Entry point
  /assets
    /sprites         — Converted critter/player PNG spritesheets
    /tiles           — Converted terrain/tile PNGs
    /maps            — Converted map JSON files
    /data            — Game data JSON (items, stats, quests, dialogue)
    /audio           — Converted MP3/OGG music and SFX
    /ui              — UI element PNGs (interface panel, fonts, icons)
  /raw_assets        — Original Fallout 1 files (not committed to git if large)
  /tools             — Python conversion scripts
  /docs              — brain_dump.txt, pm_spec.md, phases.md
  index.html
  tsconfig.json
  vite.config.ts     — Vite as bundler
  netlify.toml       — Netlify deploy config
4. TECH STACK DECISIONS
4.1 Bundler — Vite
Use Vite for fast dev server and optimized production builds. Phaser 3 works natively with Vite.
4.2 Game Engine — Phaser 3
Phaser 3 handles: rendering (WebGL/Canvas), input, animation, audio, camera, tilemaps.
Use Phaser.Scene class as the base for all scenes.
Isometric rendering via Phaser isometric plugin or manual tile offset calculations.
4.3 Language — TypeScript (strict mode)
tsconfig strict: true. All entities and systems must be fully typed.
No use of "any" type unless absolutely unavoidable and commented.
4.4 Asset Conversion — Python 3
FRM → PNG: use fallout-frm Python library or custom parser
MAP → JSON: custom Python parser based on Fallout 1 MAP format spec
MSG → JSON: simple text parser (format is well documented)
PRO → JSON: custom Python parser for prototype files
ACM → MP3: use acm2wav + ffmpeg pipeline
4.5 Deployment — Netlify
Build command: npm run build
Publish directory: dist
netlify.toml must redirect all routes to index.html for SPA behaviour
5. DATA SCHEMAS
5.1 Character Stats (SPECIAL)
{
  "id": "player",
  "name": "Vault Dweller",
  "special": {
    "strength": 5, "perception": 5, "endurance": 5,
    "charisma": 5, "intelligence": 5, "agility": 5, "luck": 5
  },
  "skills": { "small_guns": 35, "speech": 25, ... },
  "traits": ["fast_shot", "gifted"],
  "perks": [],
  "level": 1,
  "xp": 0,
  "hp": 30,
  "max_hp": 30,
  "ap": 8,
  "max_ap": 8,
  "karma": 0,
  "inventory": [],
  "equipped": { "armor": null, "weapon": null }
}
5.2 Item Schema
{
  "id": "10mm_pistol",
  "name": "10mm Pistol",
  "type": "weapon",
  "subtype": "small_gun",
  "weight": 3,
  "value": 350,
  "damage_min": 5,
  "damage_max": 12,
  "damage_type": "normal",
  "ap_cost": 5,
  "range": 25,
  "ammo_type": "10mm",
  "clip_size": 12,
  "sprite": "10mm_pistol.png",
  "description": "A semi-automatic pistol chambered in 10mm."
}
5.3 Map Schema
{
  "id": "vault_13",
  "name": "Vault 13",
  "width": 100,
  "height": 100,
  "levels": 3,
  "tiles": [ { "x": 0, "y": 0, "level": 0, "tile_id": "floor_vault", "passable": true } ],
  "objects": [ { "x": 10, "y": 5, "level": 0, "type": "door", "state": "closed" } ],
  "npcs": [ { "id": "overseer", "x": 20, "y": 10, "level": 0 } ],
  "spawn_point": { "x": 5, "y": 5, "level": 0 }
}
5.4 Dialogue Schema
{
  "npc_id": "overseer",
  "nodes": [
    {
      "id": "start",
      "text": "What do you want?",
      "responses": [
        { "text": "I need to find a water chip.", "next": "water_chip", "skill_check": null },
        { "text": "Nothing. Goodbye.", "next": "end", "skill_check": null }
      ]
    }
  ]
}
5.5 Quest Schema
{
  "id": "find_water_chip",
  "name": "Find the Water Chip",
  "description": "The vault water recycler needs a replacement chip.",
  "status": "active",
  "stages": [
    { "id": 1, "description": "Find the water chip.", "completed": false },
    { "id": 2, "description": "Return the chip to the Overseer.", "completed": false }
  ],
  "xp_reward": 1000,
  "time_limit_days": 150
}
6. CORE SYSTEM INTERFACES
6.1 CombatSystem
Responsibilities: manage turn order, AP tracking, hit chance, damage calculation, death handling
Key methods:
  startCombat(entities: Entity[]): void
  endTurn(): void
  attack(attacker: Entity, target: Entity, weapon: Item, bodyPart: BodyPart): CombatResult
  calculateHitChance(attacker: Entity, target: Entity, weapon: Item, range: number): number
  applyDamage(target: Entity, damage: number, damageType: DamageType): void
  isInCombat(): boolean
6.2 InventorySystem
Responsibilities: item management, equipping, weight, containers
Key methods:
  addItem(entity: Entity, item: Item): boolean
  removeItem(entity: Entity, itemId: string): boolean
  equipItem(entity: Entity, item: Item, slot: EquipSlot): boolean
  useItem(entity: Entity, item: Item): void
  getTotalWeight(entity: Entity): number
6.3 DialogueSystem
Responsibilities: load dialogue trees, evaluate skill checks, trigger quest flags
Key methods:
  startDialogue(player: Entity, npc: Entity): void
  selectResponse(nodeId: string, responseIndex: number): DialogueNode
  evaluateSkillCheck(skill: string, difficulty: number): boolean
  endDialogue(): void
6.4 QuestSystem
Responsibilities: track quest state, update stages, award XP
Key methods:
  activateQuest(questId: string): void
  completeStage(questId: string, stageId: number): void
  completeQuest(questId: string): void
  getActiveQuests(): Quest[]
6.5 SaveSystem
Responsibilities: serialize and deserialize full game state
Key methods:
  save(slot: number): void
  load(slot: number): GameState
  listSaves(): SaveMeta[]
  deleteSave(slot: number): void
Storage: localStorage (MVP), IndexedDB fallback if > 5MB
7. PHASER SCENE FLOW
BootScene → PreloadScene → MainMenuScene → CharacterCreationScene → GameScene

GameScene manages sub-scenes:
  → WorldMapScene (travel between locations)
  → LocationScene (isometric map, movement, NPC interaction)
  → CombatScene (overlays LocationScene during combat)
  → DialogueScene (overlays LocationScene during conversation)
  → PipBoyScene (overlays for character/inventory/map/quests)
8. ISOMETRIC RENDERING SPEC
Tile size: 80x40px (standard Fallout 1 isometric tile dimensions after conversion)
Render order: back-to-front (painter algorithm) sorted by Y position
Layers (bottom to top):
  1. Ground tiles
  2. Floor objects (items, decals)
  3. Entities (NPCs, critters, player) — sorted by Y
  4. Roof/overhead tiles
  5. UI / HUD (fixed, not scrolling)

Camera: follows player, clamped to map bounds
Hex grid: movement uses hex offset coordinates matching original Fallout 1
9. UPGRADE-READY ARCHITECTURE
The following design decisions ensure future upgrades are non-breaking:

Enhanced Lighting:
  Use Phaser 3 Light2D pipeline from day 1 (even if unused initially)
  All fire/torch objects emit a LightSource event that the renderer subscribes to

Hi-Res Critter Swap:
  All sprite references go through a SpriteRegistry class
  Swapping hi-res assets = updating the registry JSON, zero code changes

3D Model Integration:
  Critter rendering is abstracted behind a CritterRenderer interface
  Future Three.js renderer implements the same interface
10. PERFORMANCE REQUIREMENTS
• Target: 60fps on mid-range desktop browser (Chrome/Firefox)
• Max initial load time: 10 seconds on broadband
• Assets loaded progressively — only current map assets in memory
• Sprite atlases used for all critters and tiles (reduce draw calls)
• Audio loaded on demand per location
11. OUT OF SCOPE (MVP)
• Multiplayer
• Mobile/touch support
• Mod loader UI
• 3D rendering
• Hi-res critter replacement (Phase 2+)
• Enhanced lighting (Phase 2+)
• Fallout 2 content
