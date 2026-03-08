FALLOUT 1 BROWSER CLONE — BRAIN DUMP
Version 1.0 | Project Root Document | Requirements Brain Dump
PROJECT VISION
A faithful browser-based recreation of Fallout 1 using the original game assets (sprites, maps, dialogue, sound), built with Phaser 3 + TypeScript, deployable via Netlify. The project is architected to support future upgrades including enhanced lighting, high-resolution critter replacements, and potential 3D model integration.
PLATFORM
• Browser-based (no install required)
• Desktop-first, responsive for large screens
• Deployed via Netlify
• Share via URL — no launcher needed
TECH STACK
• Game Engine: Phaser 3 + TypeScript
• Asset Conversion: Python scripts (one-time pre-processing)
• Enhanced Visuals (later): Three.js or Babylon.js
• AI Asset Generation (later): Nano Banana 2 + Tripo AI
• Deployment: Netlify
• IDE: Cursor or DeepAgent + Claude Opus 4.6
ASSET PIPELINE
All original Fallout 1 assets are used as the base layer.

Source Formats:
• Critters/Sprites: .FRM files → convert to PNG spritesheets
• Maps: .MAP files → convert to JSON tile data
• Tiles/Terrain: .FRM files → convert to PNG
• Dialogue: .MSG files → parse to JSON
• Item/NPC Prototypes: .PRO files → parse to JSON
• Sound/Music: .ACM files → convert to MP3/OGG
• Fonts/UI: .FRM files → convert to PNG

Conversion Approach:
• All conversions happen at BUILD TIME via Python scripts
• Output goes to /assets folder (PNG, JSON, MP3)
• Phaser loads only web-friendly formats at runtime
• Conversion scripts stored in /tools folder
GAME VIEW & RENDERING
• Classic Fallout 1 isometric perspective
• Tile-based isometric map rendering via Phaser 3
• Layered rendering: ground tiles → objects → critters → UI
• Camera follows player with map boundaries
• Hex-grid movement system (matching original Fallout 1)
CORE GAME SYSTEMS
1. Player Character
• Full SPECIAL stats system (Strength, Perception, Endurance, Charisma, Intelligence, Agility, Luck)
• Skills system (Small Guns, Big Guns, Energy Weapons, Unarmed, Melee, Throwing, First Aid, Doctor, Sneak, Lockpick, Steal, Traps, Science, Repair, Speech, Barter, Gambling, Outdoorsman)
• Traits system (matching Fallout 1 original traits)
• Perks system (level-up rewards)
• XP and leveling system
• Karma system
• Inventory management
• Equipment slots (armor, weapons, accessories)
2. Combat System
• Turn-based with Action Points (AP) — faithful to Fallout 1
• Targeted body part attacks (eyes, legs, arms, torso, groin)
• Hit chance calculation based on SPECIAL + skills + range + cover
• Critical hits and misses
• Weapon types: unarmed, melee, small guns, big guns, energy weapons, throwing
• Ammo types and degradation
• Enemy AI turn logic
• Combat log/feed
• Death animations using original FRM critter frames
3. World & Maps
• Original Fallout 1 maps loaded from converted JSON
• Multiple locations: Vault 13, Shady Sands, Vault 15, Raiders, Hub, Necropolis, Boneyard, Cathedral, Military Base
• World map with travel between locations
• Random encounter system on world map travel
• Multi-level maps (above ground / below ground / vault levels)
• Doors, containers, interactive objects
• Elevation/level switching
4. NPC & Dialogue System
• All original .MSG dialogue files parsed and loaded
• Dialogue tree UI (matching Fallout 1 style)
• Speech skill checks in dialogue
• Barter system
• NPC schedules (basic)
• Companion system (Ian, Tycho, Dogmeat, Katja)
• Faction reputation system
5. Inventory & Items
• All original Fallout 1 items loaded from .PRO files
• Drag and drop inventory UI
• Item use, equip, drop, examine
• Container looting
• Weight limit system
• Item condition/degradation
6. Quest System
• All original Fallout 1 quests implemented
• Quest log UI
• Quest flags and state tracking
• Multiple quest resolution paths
• Main quest: Find the Water Chip → Destroy the Master
7. UI / HUD
• Faithful recreation of Fallout 1 interface panel
• HP / AP bars
• Mini-map
• Pip-Boy screen (character stats, inventory, map, quests)
• Combat mode toggle
• Skill/item hotkeys
• Save / Load game (localStorage or IndexedDB)
• Options menu (volume, resolution)
8. Audio
• Original Fallout 1 music converted from .ACM to MP3/OGG
• Ambient sound effects per location
• Combat sound effects
• UI click sounds
• Volume controls
UPGRADE ROADMAP (Post-MVP)
These are NOT in scope for the initial build but the architecture must support them:

• Enhanced Fire/Lighting — dynamic light sources from fires, lamps, explosions using Phaser 3 light pipeline or Three.js
• Hi-Res Critters — swap original FRM sprites with AI-generated high resolution versions (Nano Banana 2)
• 3D Critter Models — replace 2D sprites with 3D models generated via Tripo AI
• Weather System — rain, dust storms, fog of war
• Mod Support — allow custom asset packs to be loaded
• Multiplayer (stretch goal)
FOLDER STRUCTURE
/root
  /src              — TypeScript game source
  /assets           — Converted PNG, JSON, MP3 assets
  /tools            — Python conversion scripts
  /raw_assets       — Original Fallout 1 .FRM .MAP .MSG .PRO .ACM files
  /docs             — Brain dump, PM spec, phase checklist
  brain_dump.txt    — This document
  pm_spec.md        — Technical spec (next step)
  phases.md         — Scrum checklist (next step)
CONSTRAINTS & RULES
• No game logic in the renderer — keep systems decoupled
• All game data loaded from JSON — no hardcoded stats
• Asset conversion is offline/build-time only — never in the browser
• Save state must be serializable to JSON (localStorage)
• Code must be modular — each system is its own module
• TypeScript strict mode enabled
• No external game engine dependencies beyond Phaser 3
SUCCESS CRITERIA (MVP)
✅ Player can create a character with SPECIAL stats
✅ Player can walk around Vault 13 map
✅ Player can enter turn-based combat with a Radscorpion
✅ Player can talk to an NPC with dialogue tree
✅ Player can pick up and use an item
✅ Game runs in browser with no install
✅ Deployed live on Netlify
