#!/usr/bin/env python3
"""
extract_vault13_assets.py
Uses TILES.LST to resolve tile IDs to filenames, then copies only
the tiles used in vault13.json and v13ent.json to github_assets/.
Also copies Vault Dweller + Overseer sprites using CRITTERS.LST.
"""

import json
import shutil
from pathlib import Path

# ── PATHS ────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(r"C:\Users\aaron\OneDrive\Python-Scripts\FallClone-main\tools")
ASSETS_DIR  = BASE_DIR / "assets"
RAW_DIR     = BASE_DIR / "raw_assets"
OUTPUT_DIR  = BASE_DIR.parent / "github_assets"

MAPS_DIR    = ASSETS_DIR / "maps"
TILES_DIR   = ASSETS_DIR / "tiles"
SPRITES_DIR = ASSETS_DIR / "sprites" / "critters"

TILES_LST    = RAW_DIR / "art" / "tiles"    / "TILES.LST"
CRITTERS_LST = RAW_DIR / "art" / "critters" / "CRITTERS.LST"

MAP_FILES = ["vault13.json", "v13ent.json"]

# Keywords to match Vault Dweller + Overseer in CRITTERS.LST
CHARACTER_KEYWORDS = ["vault", "overseer", "hmjmps", "hmovr", "vaultsuit", "hapowr"]

# ── helpers ──────────────────────────────────────────────────────────────────
def load_lst(path: Path) -> dict:
    """Load a .LST file into a dict: {1: "stem", 2: "stem", ...}
    Handles both plain lines and comma-separated lines (name,framecount).
    """
    mapping = {}
    with open(path, "r", errors="replace") as f:
        for i, line in enumerate(f, 1):
            name = line.strip().split(";")[0].strip()  # strip comments
            if name:
                name = name.split(",")[0].strip()       # strip ,framecount
                mapping[i] = Path(name).stem.lower()    # strip .frm extension
    return mapping

def copy_file(src: Path, dst: Path) -> bool:
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return True
    return False

# ── 1. load LST mappings ──────────────────────────────────────────────────────
print("Loading TILES.LST...")
tile_lst = load_lst(TILES_LST)
print(f"  {len(tile_lst)} tile entries")
print(f"  Sample: {list(tile_lst.items())[:5]}")

print("Loading CRITTERS.LST...")
critter_lst = load_lst(CRITTERS_LST)
print(f"  {len(critter_lst)} critter entries")
print(f"  Sample: {list(critter_lst.items())[:5]}")

# ── 2. collect tile IDs from maps ─────────────────────────────────────────────
tile_ids = set()
for map_file in MAP_FILES:
    map_path = MAPS_DIR / map_file
    if not map_path.exists():
        print(f"  [WARN] Map not found: {map_path}")
        continue
    with open(map_path) as f:
        data = json.load(f)
    for elev in data.get("elevations", []):
        for tile in elev.get("tiles", []):
            if tile["floor"] > 0: tile_ids.add(tile["floor"])
            if tile["roof"]  > 0: tile_ids.add(tile["roof"])

print(f"\nUnique tile IDs in maps: {len(tile_ids)}")

# ── 3. resolve IDs to filenames and copy tiles ────────────────────────────────
tiles_copied  = 0
tiles_missing = 0

for tile_id in sorted(tile_ids):
    stem = tile_lst.get(tile_id)
    if not stem:
        tiles_missing += 1
        continue
    src = TILES_DIR / f"{stem}.png"
    if copy_file(src, OUTPUT_DIR / "tiles" / f"{stem}.png"):
        copy_file(src.with_suffix(".json"), OUTPUT_DIR / "tiles" / f"{stem}.json")
        tiles_copied += 1
    else:
        tiles_missing += 1

print(f"Tiles copied: {tiles_copied}  |  missing: {tiles_missing}")

# ── 4. copy character sprites ─────────────────────────────────────────────────
character_stems = set()
for idx, stem in critter_lst.items():
    for kw in CHARACTER_KEYWORDS:
        if kw.lower() in stem.lower():
            character_stems.add(stem)

print(f"\nCharacter stems found in CRITTERS.LST: {len(character_stems)}")
print(f"  {sorted(character_stems)}")

sprites_copied = 0
for stem in character_stems:
    for src in SPRITES_DIR.glob(f"{stem}*.png"):
        if copy_file(src, OUTPUT_DIR / "sprites" / "critters" / src.name):
            copy_file(src.with_suffix(".json"), OUTPUT_DIR / "sprites" / "critters" / src.with_suffix(".json").name)
            sprites_copied += 1

print(f"Character sprites copied: {sprites_copied}")

# ── 5. copy map JSON files ────────────────────────────────────────────────────
for map_file in MAP_FILES:
    copy_file(MAPS_DIR / map_file, OUTPUT_DIR / "maps" / map_file)
print(f"Maps copied: {len(MAP_FILES)}")

# ── 6. summary ────────────────────────────────────────────────────────────────
total = sum(1 for _ in OUTPUT_DIR.rglob("*") if _.is_file())
size  = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file())
print(f"\n{'='*50}")
print(f"Output : {OUTPUT_DIR.resolve()}")
print(f"Files  : {total}")
print(f"Size   : {size/1024/1024:.1f} MB")
print(f"{'='*50}")
print("Done! Upload github_assets/ to your repo.")
