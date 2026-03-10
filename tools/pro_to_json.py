#!/usr/bin/env python3
"""
pro_to_json.py — Converts Fallout 1 .PRO prototype files to JSON.

Every interactive entity in Fallout 1 has a prototype file (.PRO) that defines
its static properties: art, weight, damage, stats, AI, etc.  The game reads
these at runtime; this script converts them to web-friendly JSON consumed by
the browser engine.

PRO files live in type-specific subdirectories under PROTO/:
  PROTO/ITEMS/      — armour, weapons, ammo, drugs, containers, keys, misc
  PROTO/CRITTERS/   — all NPCs and enemies
  PROTO/SCENERY/    — doors, stairs, ladders, rubble, containers (map deco)
  PROTO/WALLS/      — wall tiles
  PROTO/TILES/      — floor/roof tiles
  PROTO/MISC/       — exit grids, etc.

PRO format reference (all values little-endian signed int32 unless noted)
-------------------------------------------------------------------------
Common header (all types, 28 bytes):
  int32  proto_id       encodes type in bits 24-31, file index in bits 0-23
  int32  message_id     base index into the type's .MSG file for name + desc
                        (name = message_id, description = message_id + 1)
  int32  fid            FRM image ID (type in bits 24-31, art index in 0-11)
  int32  light_radius
  int32  light_intensity
  uint32 flags          bitmask (see FLAG_* constants below)
  uint32 flags_ext      extra flags (mostly Fallout 2; treat as opaque in F1)

After the common header, type-specific fields follow.

Object type IDs (proto_id >> 24):
  0 = item
  1 = critter
  2 = scenery
  3 = wall
  4 = tile
  5 = misc

Item sub-types (item_type field):
  0 = armor       3 = weapon
  1 = container   4 = ammo
  2 = drug        5 = misc_item
                  6 = key

SPECIAL stat order (used in critter records):
  0=Strength 1=Perception 2=Endurance 3=Charisma
  4=Intelligence 5=Agility 6=Luck

Skills order (18 skills, Fallout 1):
  0=SmallGuns 1=BigGuns 2=EnergyWeapons 3=Unarmed 4=MeleeWeapons
  5=Throwing 6=FirstAid 7=Doctor 8=Sneak 9=Lockpick 10=Steal
  11=Traps 12=Science 13=Repair 14=Speech 15=Barter 16=Gambling
  17=Outdoorsman

Damage types:
  0=Normal 1=Fire 2=Plasma 3=Electrical 4=EMP 5=Explosive 6=Radiation 7=Poison

Usage
-----
  python pro_to_json.py raw_assets/proto/items/000001.pro  assets/data/items/000001.json
  python pro_to_json.py raw_assets/proto/                  assets/data/
"""

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Constants ─────────────────────────────────────────────────────────────────

PROTO_TYPE_NAMES = {0: "item", 1: "critter", 2: "scenery", 3: "wall", 4: "tile", 5: "misc"}

ITEM_TYPE_NAMES = {
    0: "armor", 1: "container", 2: "drug",
    3: "weapon", 4: "ammo", 5: "misc_item", 6: "key",
}

SCENERY_TYPE_NAMES = {
    0: "door", 1: "stairs", 2: "elevator", 3: "ladder_bottom",
    4: "ladder_top", 5: "generic",
}

DAMAGE_TYPE_NAMES = {
    0: "normal", 1: "fire", 2: "plasma", 3: "electrical",
    4: "emp", 5: "explosive", 6: "radiation", 7: "poison",
}

SPECIAL_NAMES  = ["strength", "perception", "endurance", "charisma",
                  "intelligence", "agility", "luck"]

SKILL_NAMES = [
    "small_guns", "big_guns", "energy_weapons", "unarmed", "melee_weapons",
    "throwing", "first_aid", "doctor", "sneak", "lockpick", "steal",
    "traps", "science", "repair", "speech", "barter", "gambling", "outdoorsman",
]

MATERIAL_NAMES = {
    0: "glass", 1: "metal", 2: "plastic", 3: "wood",
    4: "dirt", 5: "stone", 6: "cement", 7: "leather",
}

# Object flags (common header flags field)
OBJ_FLAGS = {
    0x00000001: "flat",
    0x00000002: "no_block",
    0x00000004: "multi_hex",
    0x00000008: "no_highlight",
    0x00000010: "used",
    0x00000020: "door_open",
    0x00000040: "door_locked",
    0x00000080: "no_remove",
    0x00000100: "no_flatten",
    0x00000200: "short_limbs",
    0x00000400: "hidden",
    0x00000800: "poison",
    0x00001000: "radiated",
    0x00002000: "critter_out_of_gas",
    0x00004000: "combat_mode",
    0x00008000: "dead",
    0x00010000: "on_some_tile",
    0x00020000: "see_through",
    0x00040000: "shoot_through",
    0x00080000: "light_through",
    0x00100000: "trans_none",
    0x00200000: "trans_wall",
    0x00400000: "trans_glass",
    0x00800000: "trans_steam",
    0x01000000: "trans_energy",
    0x02000000: "trans_red",
    0x04000000: "walls_end",
    0x08000000: "rotated",
    0x10000000: "no_shadow",
    0x20000000: "light_thru",
    0x40000000: "shoot_thru",
    0x80000000: "trans_laser",
}


def decode_flags(flags: int) -> List[str]:
    return [name for bit, name in OBJ_FLAGS.items() if flags & bit]


def decode_fid(fid: int) -> dict:
    return {
        "raw":       fid,
        "obj_type":  (fid >> 24) & 0xFF,
        "anim_set":  (fid >> 16) & 0x0F,
        "art_index": fid & 0x00000FFF,
    }


# ── Common header ─────────────────────────────────────────────────────────────

_COMMON_FMT  = "<iiiii II"          # 7 fields: proto_id, msg_id, fid, light_r, light_i, flags, flags_ext
_COMMON_SIZE = struct.calcsize(_COMMON_FMT)   # 28 bytes


def parse_common(data: bytes, offset: int) -> Tuple[dict, int]:
    if offset + _COMMON_SIZE > len(data):
        raise ValueError("File too short for common PRO header")
    pid, msg_id, fid, light_r, light_i, flags, flags_ext = struct.unpack_from(
        _COMMON_FMT, data, offset
    )
    obj_type = (pid >> 24) & 0xFF
    common = {
        "proto_id":        pid,
        "proto_index":     pid & 0x00FFFFFF,
        "object_type":     PROTO_TYPE_NAMES.get(obj_type, str(obj_type)),
        "message_id":      msg_id,       # name = msg_id, description = msg_id+1
        "fid":             decode_fid(fid),
        "light_radius":    light_r,
        "light_intensity": light_i,
        "flags":           decode_flags(flags),
        "flags_raw":       flags,
        "flags_ext_raw":   flags_ext,
    }
    return common, offset + _COMMON_SIZE


# ── Item parsers ──────────────────────────────────────────────────────────────

_ITEM_BASE_FMT  = "<iiiiiii bxxx"     # item_type, material, size, weight, cost, inv_fid, sound_id + 3 pad bytes
_ITEM_BASE_SIZE = struct.calcsize(_ITEM_BASE_FMT)   # 32 bytes


def _read_i32(data: bytes, offset: int) -> Tuple[int, int]:
    v = struct.unpack_from("<i", data, offset)[0]
    return v, offset + 4


def parse_item(data: bytes, offset: int, base: dict) -> dict:
    """Parse item-specific fields after the common header."""
    if offset + _ITEM_BASE_SIZE > len(data):
        return base

    item_type, material, size, weight, cost, inv_fid, sound_id = struct.unpack_from(
        _ITEM_BASE_FMT, data, offset
    )
    offset += _ITEM_BASE_SIZE

    base.update({
        "item_type":  ITEM_TYPE_NAMES.get(item_type, str(item_type)),
        "material":   MATERIAL_NAMES.get(material, str(material)),
        "size":       size,
        "weight":     weight,
        "cost":       cost,
        "inv_fid":    decode_fid(inv_fid),
        "sound_id":   sound_id,
    })

    # Sub-type specific extensions
    if item_type == 0:    # armor
        base.update(_parse_armor(data, offset))
    elif item_type == 1:  # container
        base.update(_parse_container(data, offset))
    elif item_type == 2:  # drug
        base.update(_parse_drug(data, offset))
    elif item_type == 3:  # weapon
        base.update(_parse_weapon(data, offset))
    elif item_type == 4:  # ammo
        base.update(_parse_ammo(data, offset))

    return base


def _parse_armor(data: bytes, offset: int) -> dict:
    """Armor: AC, damage thresholds/resistances for all 7 damage types."""
    if offset + (2 + 7 * 2) * 4 > len(data):
        return {}
    fmt = "<" + "i" * (2 + 7 * 2)   # ac, perk, then 7×(threshold, resistance)
    vals = struct.unpack_from(fmt, data, offset)
    ac   = vals[0]
    perk = vals[1]
    dt = {DAMAGE_TYPE_NAMES[i]: {"threshold": vals[2 + i*2], "resistance": vals[3 + i*2]}
          for i in range(7)}
    return {"armor_class": ac, "perk": perk, "damage_protection": dt}


def _parse_container(data: bytes, offset: int) -> dict:
    if offset + 8 > len(data):
        return {}
    max_size, perk = struct.unpack_from("<ii", data, offset)
    return {"max_size": max_size, "perk": perk}


def _parse_drug(data: bytes, offset: int) -> dict:
    """Drug: which stat it boosts and by how much, over three time stages."""
    if offset + 9 * 4 > len(data):
        return {}
    stat0, stat1, stat2 = struct.unpack_from("<iii", data, offset)
    offset += 12
    amounts = []
    for _ in range(3):   # immediate, 1-hour, 4-hour effects
        a0, a1, a2 = struct.unpack_from("<iii", data, offset)
        amounts.append([a0, a1, a2])
        offset += 12
    return {
        "effect_stats": [stat0, stat1, stat2],
        "effect_amounts": amounts,
    }


def _parse_weapon(data: bytes, offset: int) -> dict:
    """Weapon: damage, ranges, AP costs, ammo type, perks, etc."""
    if offset + 18 * 4 > len(data):
        return {}
    (anim_code, min_damage, max_damage, damage_type,
     attack_mode_1, attack_mode_2,
     min_range_1, max_range_1, min_range_2, max_range_2,
     perk, shots_per_burst, caliber, ammo_pid,
     ammo_capacity, sound_id_ext,
     ap_cost_1, ap_cost_2) = struct.unpack_from("<18i", data, offset)
    return {
        "anim_code":     anim_code,
        "damage":        {"min": min_damage, "max": max_damage},
        "damage_type":   DAMAGE_TYPE_NAMES.get(damage_type, str(damage_type)),
        "attack_modes":  [attack_mode_1, attack_mode_2],
        "ranges": [
            {"min": min_range_1, "max": max_range_1},
            {"min": min_range_2, "max": max_range_2},
        ],
        "perk":            perk,
        "shots_per_burst": shots_per_burst,
        "caliber":         caliber,
        "ammo_proto_id":   ammo_pid,
        "ammo_capacity":   ammo_capacity,
        "ap_costs":        [ap_cost_1, ap_cost_2],
    }


def _parse_ammo(data: bytes, offset: int) -> dict:
    if offset + 6 * 4 > len(data):
        return {}
    caliber, magazine_size, ac_mod, dr_mod, damage_mult, damage_div = \
        struct.unpack_from("<6i", data, offset)
    return {
        "caliber":       caliber,
        "magazine_size": magazine_size,
        "ac_modifier":   ac_mod,
        "dr_modifier":   dr_mod,
        "damage_mult":   damage_mult,
        "damage_div":    damage_div,
    }


# ── Critter parser ────────────────────────────────────────────────────────────

def parse_critter(data: bytes, offset: int, base: dict) -> dict:
    """Parse critter-specific fields (SPECIAL, skills, AI, etc.)."""
    # Critter header: flags (uint32), fid_na (int32), hit_pts, action_pts,
    # carry_weight, armor_class, unarmed_damage, unarmed_range, SPECIAL[7],
    # bonus_hp_per_level, skills[18], body_type, exp, kill_type, damage_type
    n_fields = 1 + 1 + 5 + 7 + 1 + 18 + 4
    if offset + n_fields * 4 > len(data):
        return base

    fmt = "<II5i7ii18iiiii"
    vals = list(struct.unpack_from(fmt, data, offset))
    i = 0

    critter_flags = vals[i]; i += 1
    fid_na        = vals[i]; i += 1  # FRM for 'not applicable' (standing)
    hit_pts       = vals[i]; i += 1
    action_pts    = vals[i]; i += 1
    carry_weight  = vals[i]; i += 1
    armor_class   = vals[i]; i += 1
    unarmed_dmg   = vals[i]; i += 1

    unarmed_range = vals[i]; i += 1

    special = {SPECIAL_NAMES[j]: vals[i + j] for j in range(7)}
    i += 7

    bonus_hp      = vals[i]; i += 1
    skills = {SKILL_NAMES[j]: vals[i + j] for j in range(18)}
    i += 18

    body_type     = vals[i]; i += 1
    experience    = vals[i]; i += 1
    kill_type     = vals[i]; i += 1
    damage_type   = vals[i]; i += 1

    base.update({
        "critter_flags":  critter_flags,
        "fid_na":         decode_fid(fid_na),
        "hit_points":     hit_pts,
        "action_points":  action_pts,
        "carry_weight":   carry_weight,
        "armor_class":    armor_class,
        "unarmed":        {"damage": unarmed_dmg, "range": unarmed_range},
        "special":        special,
        "bonus_hp_per_level": bonus_hp,
        "skills":         skills,
        "body_type":      body_type,
        "experience":     experience,
        "kill_type":      kill_type,
        "damage_type":    DAMAGE_TYPE_NAMES.get(damage_type, str(damage_type)),
    })
    return base


# ── Scenery parser ────────────────────────────────────────────────────────────

def parse_scenery(data: bytes, offset: int, base: dict) -> dict:
    if offset + 4 > len(data):
        return base
    scenery_type = struct.unpack_from("<i", data, offset)[0]
    base["scenery_type"] = SCENERY_TYPE_NAMES.get(scenery_type, str(scenery_type))
    offset += 4

    if scenery_type == 0:   # door
        if offset + 8 <= len(data):
            walkable, sfx_unknown = struct.unpack_from("<ii", data, offset)
            base["walkable_when_open"] = bool(walkable)
    elif scenery_type in (1, 2, 3, 4):  # stairs / elevator / ladder
        if offset + 8 <= len(data):
            dest_map, dest_tile = struct.unpack_from("<ii", data, offset)
            base["destination_map"]  = dest_map
            base["destination_tile"] = dest_tile
    return base


# ── Wall parser ───────────────────────────────────────────────────────────────

def parse_wall(data: bytes, offset: int, base: dict) -> dict:
    if offset + 8 > len(data):
        return base
    material, sfx = struct.unpack_from("<ii", data, offset)
    base["material"] = MATERIAL_NAMES.get(material, str(material))
    return base


# ── Tile / Misc parsers ───────────────────────────────────────────────────────

def parse_tile(data: bytes, offset: int, base: dict) -> dict:
    if offset + 4 <= len(data):
        material = struct.unpack_from("<i", data, offset)[0]
        base["material"] = MATERIAL_NAMES.get(material, str(material))
    return base


def parse_misc(data: bytes, offset: int, base: dict) -> dict:
    if offset + 4 <= len(data):
        base["misc_type"] = struct.unpack_from("<i", data, offset)[0]
    return base


# ── Top-level file parser ─────────────────────────────────────────────────────

PARSERS = {
    "item":    parse_item,
    "critter": parse_critter,
    "scenery": parse_scenery,
    "wall":    parse_wall,
    "tile":    parse_tile,
    "misc":    parse_misc,
}


def parse_pro(data: bytes) -> dict:
    """Parse a complete PRO file and return a JSON-serialisable dict."""
    base, offset = parse_common(data, 0)
    obj_type = base["object_type"]
    parser = PARSERS.get(obj_type)
    if parser:
        if obj_type == "item":
            base = parser(data, offset, base)
        else:
            base = parser(data, offset, base)
    return base


def convert_file(pro_path: Path, out_path: Path) -> bool:
    try:
        data  = pro_path.read_bytes()
        proto = parse_pro(data)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(proto, indent=2))
        print(f"  OK   {pro_path.name:<20} type={proto['object_type']}")
        return True
    except Exception as exc:
        print(f"  FAIL {pro_path.name}: {exc}", file=sys.stderr)
        return False



def find_proto_dir(base: Path) -> Optional[Path]:
    """
    Locate the PROTO directory under `base`, trying several casing variants.

    Fallout 1 ships with uppercase PROTO/; some installs use lowercase proto/.
    Tries (in order): PROTO/, proto/, protos/, Protos/
    Returns the first matching Path, or None if none found.
    """
    for name in ("PROTO", "proto", "protos", "Protos"):
        candidate = base / name
        if candidate.is_dir():
            return candidate
    return None


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Convert Fallout 1 .PRO prototype files to JSON."
    )
    ap.add_argument("input",  help="Input .pro file or directory (or parent of PROTO/)")
    ap.add_argument("output", help="Output .json file or directory")
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output)

    # If the user passed the raw_assets root instead of the proto dir, auto-detect.
    if inp.is_dir() and not any(inp.rglob("*.PRO")):
        detected = find_proto_dir(inp)
        if detected:
            print(f"  Auto-detected proto directory: {detected}")
            inp = detected

    if inp.is_file():
        out_file = out if out.suffix == ".json" else out / (inp.stem.lower() + ".json")
        ok = convert_file(inp, out_file)
        sys.exit(0 if ok else 1)

    elif inp.is_dir():
        files = sorted({
            p for p in inp.rglob("*")
            if p.suffix.upper() == ".PRO" and p.is_file()
        })
        ok_n = err_n = 0
        for f in files:
            rel    = f.parent.relative_to(inp)
            target = out / rel / (f.stem.lower() + ".json")
            if convert_file(f, target):
                ok_n += 1
            else:
                err_n += 1
        print(f"\nResult  : {ok_n} converted, {err_n} failed")
        sys.exit(0 if err_n == 0 else 1)

    else:
        print(f"ERROR: {inp} is not a file or directory", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
