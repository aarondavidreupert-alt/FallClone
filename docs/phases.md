FALLOUT 1 BROWSER CLONE — PHASED SCRUM CHECKLIST
Version 1.0 | Drop in /docs | Use this to drive AI agent phases in Cursor / DeepAgent
Prompt your agent: "Start Phase X" — test — fix bugs — move to next phase.
PHASE 0 — PROJECT SETUP
Goal: Working empty project that builds and deploys.

[ ] Initialise project with Vite + TypeScript template
[ ] Install Phaser 3 and type definitions
[ ] Configure tsconfig.json with strict mode
[ ] Set up /src folder structure (scenes, systems, entities, ui, utils, loaders)
[ ] Create empty index.html entry point
[ ] Create main.ts with basic Phaser game config (800x600, WebGL)
[ ] Create BootScene that loads a placeholder screen
[ ] Confirm npm run dev works locally
[ ] Create netlify.toml with build command and publish dir
[ ] Deploy empty project to Netlify — confirm live URL works
[ ] Initialise git repo and push to GitHub

✅ Phase 0 Complete when: blank Phaser canvas loads in browser at Netlify URL
PHASE 1 — ASSET PIPELINE
Goal: All raw Fallout 1 assets converted to web-friendly formats.

[ ] Set up /raw_assets folder with original Fallout 1 files
[ ] Write Python script: frm_to_png.py — converts .FRM sprite files to PNG spritesheets
[ ] Write Python script: map_to_json.py — converts .MAP files to JSON tile data
[ ] Write Python script: msg_to_json.py — converts .MSG dialogue files to JSON
[ ] Write Python script: pro_to_json.py — converts .PRO prototype files to JSON
[ ] Write Python script: acm_to_mp3.py — converts .ACM audio to MP3/OGG via ffmpeg
[ ] Write master script: convert_all.py — runs all conversions in sequence
[ ] Run conversion pipeline on all Fallout 1 assets
[ ] Verify output: /assets/sprites, /assets/tiles, /assets/maps, /assets/data, /assets/audio all populated
[ ] Spot check 5 critter sprites render correctly as PNG
[ ] Spot check Vault 13 map JSON has correct tile data
[ ] Spot check overseer dialogue JSON is readable

✅ Phase 1 Complete when: all assets converted and verified in /assets folder
PHASE 2 — MAP RENDERING
Goal: Vault 13 map renders correctly in the browser with camera.

[ ] Create PreloadScene — loads all tile PNGs and map JSON for Vault 13
[ ] Create LocationScene — base scene for all in-game maps
[ ] Implement isometric tile renderer (hex offset calculations)
[ ] Render Vault 13 ground layer tiles
[ ] Render Vault 13 object layer (doors, furniture, walls)
[ ] Implement render sorting (painter algorithm, Y-sort for entities)
[ ] Implement camera that follows a fixed point
[ ] Clamp camera to map boundaries
[ ] Implement multi-level support (level 0/1/2 switching)
[ ] Render roof tiles on correct layer
[ ] Test all Vault 13 levels render without visual glitches

✅ Phase 2 Complete when: Vault 13 map renders correctly with all layers visible
PHASE 3 — PLAYER CHARACTER & MOVEMENT
Goal: Player sprite walks around Vault 13 with correct isometric movement.

[ ] Create Player entity class with position, level, sprite reference
[ ] Load player walking spritesheet (converted from FRM)
[ ] Implement 6-directional movement animations (Fallout 1 uses 6 directions)
[ ] Implement click-to-move pathfinding on hex grid
[ ] Implement collision detection (impassable tiles block movement)
[ ] Implement door interaction (click door → open/close)
[ ] Camera follows player smoothly
[ ] Player renders correctly in Y-sort layer with objects
[ ] Implement level transition (stairs/ladders change active level)
[ ] Test movement across all Vault 13 levels

✅ Phase 3 Complete when: player walks around Vault 13, opens doors, changes levels
PHASE 4 — CHARACTER CREATION & STATS
Goal: Full SPECIAL character creation screen before game starts.

[ ] Create CharacterCreationScene
[ ] Implement SPECIAL stat allocation UI (7 stats, 5 points to distribute)
[ ] Implement Skills display (auto-calculated from SPECIAL)
[ ] Implement Traits selection (pick 2 from list)
[ ] Implement character name input
[ ] Implement gender selection
[ ] Create StatsSystem — calculates derived stats (HP, AP, carry weight, etc.) from SPECIAL
[ ] Persist character data to GameState object
[ ] Create HUD overlay — shows HP bar, AP bar, basic info
[ ] Confirm/Done button transitions to GameScene with character loaded

✅ Phase 4 Complete when: player creates character and enters Vault 13 with correct stats on HUD
PHASE 5 — NPC & DIALOGUE SYSTEM
Goal: Player can talk to NPCs with full dialogue trees.

[ ] Create NPC entity class (position, sprite, dialogue reference, proto data)
[ ] Load NPC spritesheets from converted FRM files
[ ] Place Overseer and key Vault 13 NPCs on map from map JSON
[ ] Implement NPC click interaction (cursor changes on hover)
[ ] Create DialogueSystem — loads dialogue JSON, manages node traversal
[ ] Create DialogueScene UI — NPC portrait, text box, response options
[ ] Implement skill checks in dialogue responses
[ ] Implement dialogue flags (track what has been said)
[ ] Implement barter screen (basic buy/sell UI)
[ ] Load and test all Vault 13 NPC dialogues
[ ] Load and test Shady Sands NPC dialogues

✅ Phase 5 Complete when: player talks to Overseer, sees full dialogue tree, can barter
PHASE 6 — INVENTORY & ITEMS
Goal: Full inventory system with item use and equipment.

[ ] Load all item data from converted PRO JSON files
[ ] Create Item entity class
[ ] Create InventorySystem (add, remove, equip, use, weight)
[ ] Place items on maps (from map JSON object layer)
[ ] Implement item pickup (click item on ground)
[ ] Create PipBoy InventoryPanel UI (grid layout, item icons)
[ ] Implement item examine (right-click → description popup)
[ ] Implement item equip (drag to equipment slot or double-click)
[ ] Implement item use (stimpaks heal, food restores, etc.)
[ ] Implement item drop (drag out of inventory to ground)
[ ] Implement container looting (click container → loot UI)
[ ] Implement carry weight limit and overweight penalty

✅ Phase 6 Complete when: player picks up a Stimpak, equips a pistol, uses the Stimpak to heal
PHASE 7 — COMBAT SYSTEM
Goal: Full turn-based AP combat with at least one enemy type.

[ ] Create Critter entity class (Radscorpion as first test enemy)
[ ] Load Radscorpion spritesheet and animations from FRM
[ ] Create CombatSystem (turn order, AP tracking, attack resolution)
[ ] Implement combat trigger (player walks into enemy detection range)
[ ] Implement combat HUD (AP counter, end turn button, combat log)
[ ] Implement player attack action (click enemy → attack with equipped weapon)
[ ] Implement targeted attack UI (body part selection)
[ ] Implement hit chance calculation (SPECIAL + skill + range + cover)
[ ] Implement damage calculation (weapon damage + damage type vs armour)
[ ] Implement critical hits and misses
[ ] Implement death animations (FRM death frames per damage type)
[ ] Implement basic enemy AI (move toward player, attack when in range)
[ ] Implement XP award on kill
[ ] Implement level up screen
[ ] Test combat with Radscorpion outside Vault 13

✅ Phase 7 Complete when: player enters combat, kills a Radscorpion, levels up
PHASE 8 — QUEST SYSTEM & WORLD MAP
Goal: Main quest active, world map travel between locations.

[ ] Create QuestSystem (activate, stage complete, complete, XP reward)
[ ] Load all quest data from JSON
[ ] Implement quest log UI in PipBoy
[ ] Trigger "Find the Water Chip" quest from Overseer dialogue
[ ] Create WorldMapScene — renders world map image with location markers
[ ] Implement travel between locations (click marker → travel)
[ ] Implement travel time (days pass, time limit countdown)
[ ] Implement random encounter system on world map travel
[ ] Load and render: Shady Sands, Vault 15, Raiders Camp maps
[ ] Load and render: The Hub, Necropolis maps
[ ] Load and render: Boneyard, Cathedral, Military Base maps
[ ] Implement all main quest stages and flags
[ ] Implement side quests for Shady Sands and The Hub

✅ Phase 8 Complete when: player travels world map, completes a side quest, main quest progresses
PHASE 9 — AUDIO & FULL UI POLISH
Goal: Sound, music, full PipBoy, save/load — game feels complete.

[ ] Load and play location music (converted ACM → MP3)
[ ] Load and play combat music
[ ] Load and play ambient sound effects per location
[ ] Load and play combat SFX (gunshots, hits, deaths)
[ ] Load and play UI click sounds
[ ] Implement volume controls in options menu
[ ] Complete PipBoy UI — Stats tab, Skills tab, Perks tab
[ ] Complete PipBoy UI — Map tab (local map + world map)
[ ] Implement SaveSystem (save to localStorage, 3 save slots)
[ ] Implement LoadSystem (load from save slot)
[ ] Implement Main Menu (New Game, Load Game, Options)
[ ] Implement pause menu (in-game)
[ ] Implement game over screen (death)
[ ] Implement ending slides (win condition)

✅ Phase 9 Complete when: full playthrough possible from main menu to ending
PHASE 10 — ENHANCED VISUALS (UPGRADE PHASE)
Goal: Dynamic lighting, hi-res critters, visual polish.

[ ] Enable Phaser 3 Light2D pipeline
[ ] Add dynamic light sources to fire objects (barrels, torches, campfires)
[ ] Add dynamic light to explosions and muzzle flashes
[ ] Add ambient darkness to underground/vault maps
[ ] Generate hi-res critter sprites using Nano Banana 2
[ ] Update SpriteRegistry to point to hi-res assets
[ ] Generate hi-res tile textures using Nano Banana 2
[ ] Test visual consistency across all maps
[ ] Performance test — confirm 60fps maintained with lighting enabled

✅ Phase 10 Complete when: dynamic fire lighting works and hi-res critters render correctly
PHASE 11 — FINAL QA & DEPLOYMENT
Goal: Stable, deployed, shareable game.

[ ] Full playthrough QA — play from start to finish, log all bugs
[ ] Fix all critical bugs (crashes, softlocks, broken quests)
[ ] Fix all major bugs (wrong stats, broken combat, missing dialogue)
[ ] Performance profiling — fix any frame rate drops
[ ] Optimise asset loading (sprite atlases, lazy loading)
[ ] Cross-browser test (Chrome, Firefox, Edge)
[ ] Final Netlify production deploy
[ ] Confirm live URL works end-to-end
[ ] Write README.md with project description and credits

✅ Phase 11 Complete when: game is live, stable, and shareable via URL 🎉
AGENT PROMPTING GUIDE
Use these exact prompts with your AI agent in Cursor or DeepAgent:

"Read brain_dump.txt, pm_spec.md and this phases.md file. Start Phase 0."
"Phase 0 is working. Start Phase 1."
"There is a bug: [describe bug]. Fix it without breaking anything else."
"Phase 1 is complete. Start Phase 2."
... repeat until Phase 11 ✅
