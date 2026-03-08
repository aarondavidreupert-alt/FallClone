#!/usr/bin/env python3
"""
map_to_json.py — Converts Fallout 1 .MAP binary files to JSON tile data.

The MAP file defines the tile layout and object placement for every location in
Fallout 1. This script extracts everything the web engine needs for Phases 2-5:
  - Tile IDs (floor + roof) for all three elevation levels
  - Object placement (position, prototype ID, FRM ID, flags)
  - Script instance list (prototype links, spatial/time triggers)
  - Map metadata (player start, map ID, dimensions)

MAP format reference (all values little-endian)
-----------------------------------------------
Header (188 bytes):
  int32    version          19 for Fallout 1
  char[16] map_name         null-padded ASCII filename (no extension)
  int32    player_pos       default hex tile position (flat index into 100×100 grid)
  int32    player_elev      default elevation (0 = ground, 1 = sub-level, 2 = sub-sub)
  int32    player_rot       default facing direction (0-5)
  int32    lvar_count       number of map-local script variables
  int32    script_type      map-script type (0=none,1=spatial,2=time,3=item,4=critter)
  int32    body_type        unused; always 0
  int32    obj_count        legacy; unused at header level in Fallout 1
  int32    gvar_count       number of global script variables
  int32    map_id           numeric ID used by scripts to identify the map
  int32    timestamp        in-game clock value when the map was last saved
  int32[44] _padding        reserved; zeroed in all known Fallout 1 maps

After header:
  int32[lvar_count]  local script variable values
  int32[gvar_count]  global script variable values

Tile data (120 000 bytes = 3 elevations × 100 × 100 × 4 bytes):
  uint32 per tile:
    bits 16-31  roof/ceiling tile ID   (0 = no tile)
    bits  0-15  floor tile ID          (0 = no tile)
  Tiles are stored in row-major order, top-left to bottom-right.
  IDs reference entries in the TILES/ FRM art directory.

Scripts section (after tile data):
  int32  script_count       total number of script instances
  For each script:
    int32 pid               script prototype ID (encodes type + file index)
    int32 next_script       linked-list index (-1 = end)
    int32 script_type_data  interpretation depends on script_type
    int32 num_procs         number of procedures (usually 0 in instances)
    [type-specific extra words follow — see inline comments]

Objects section (after scripts):
  For each of the 3 elevations:
    int32 object_count
    For each object:
      [object_header — see parse_object()]

Usage
-----
  python map_to_json.py raw_assets/maps/V13ENT.MAP  assets/maps/v13ent.json
  python map_to_json.py raw_assets/maps/            assets/maps/
"""

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ── Constants ─────────────────────────────────────────────────────────────────

MAP_WIDTH  = 100
MAP_HEIGHT = 100
MAP_TILES  = MAP_WIDTH * MAP_HEIGHT   # 10 000 per elevation
NUM_ELEVATIONS = 3

# Header layout
_HDR_FMT  = "<i16s10i44i"            # 4 + 16 + 40 + 176 = 236?  let's verify
# Actually: 4 + 16 + (10×4) + (44×4) = 4+16+40+176 = 236.
# But the Fallout 1 MAP header is 188 bytes.  Adjust: 44 ints of padding is too many.
# Correct split: 10 named ints + padding to reach 188 bytes total.
# 188 - 4 - 16 - 10*4 = 188 - 60 = 128 bytes = 32 ints of padding.
_HDR_FMT  = "<i16s10i32i"
_HDR_SIZE = struct.calcsize(_HDR_FMT)   # should be 188

# Prototype type IDs (high byte of proto_id)
PROTO_TYPE = {0: "item", 1: "critter", 2: "scenery", 3: "wall", 4: "tile", 5: "misc"}

# Script type IDs
SCRIPT_TYPE = {0: "none", 1: "spatial", 2: "time", 3: "item", 4: "critter"}


# ── Header parsing ────────────────────────────────────────────────────────────

def parse_header(data: bytes) -> Tuple[dict, int]:
    """
    Parse the 188-byte MAP header.
    Returns (header_dict, next_offset).
    """
    if len(data) < _HDR_SIZE:
        raise ValueError(f"File too short for MAP header: {len(data)}")

    fields = struct.unpack_from(_HDR_FMT, data, 0)
    version     = fields[0]
    map_name    = fields[1].rstrip(b"\x00").decode("ascii", errors="replace")
    player_pos  = fields[2]
    player_elev = fields[3]
    player_rot  = fields[4]
    lvar_count  = fields[5]
    script_type = fields[6]
    # fields[7] = body_type (unused)
    # fields[8] = obj_count (legacy)
    gvar_count  = fields[9]
    map_id      = fields[10]
    timestamp   = fields[11]
    # fields[12:44] = padding

    hdr = {
        "version":     version,
        "map_name":    map_name,
        "player_default": {
            "pos":  player_pos,
            "elev": player_elev,
            "rot":  player_rot,
        },
        "lvar_count":  lvar_count,
        "gvar_count":  gvar_count,
        "script_type": SCRIPT_TYPE.get(script_type, str(script_type)),
        "map_id":      map_id,
        "timestamp":   timestamp,
    }
    return hdr, _HDR_SIZE


# ── Variable sections ─────────────────────────────────────────────────────────

def parse_variables(data: bytes, offset: int, count: int) -> Tuple[List[int], int]:
    """Read count int32 values and return (list, new_offset)."""
    size = count * 4
    if offset + size > len(data):
        raise ValueError(f"File truncated reading {count} variables at offset {offset}")
    values = list(struct.unpack_from(f"<{count}i", data, offset))
    return values, offset + size


# ── Tile data ─────────────────────────────────────────────────────────────────

def parse_tiles(data: bytes, offset: int) -> Tuple[List[dict], int]:
    """
    Parse tile data for all 3 elevations.
    Each elevation is a 100×100 flat array of uint32 values.

    Tile uint32 layout:
      bits 16-31  roof tile ID  (0 = no tile)
      bits  0-15  floor tile ID (0 = no tile)

    Returns (elevations_list, new_offset) where each elevation is:
      {
        "width":  100,
        "height": 100,
        "tiles":  [{"floor": int, "roof": int}, ...]   # len = 10000
      }
    """
    total_tiles = NUM_ELEVATIONS * MAP_TILES
    size = total_tiles * 4
    if offset + size > len(data):
        raise ValueError(
            f"File truncated in tile data at offset {offset}: "
            f"need {size} bytes, have {len(data) - offset}"
        )

    elevations: List[dict] = []
    for elev in range(NUM_ELEVATIONS):
        tiles: List[dict] = []
        for i in range(MAP_TILES):
            raw = struct.unpack_from("<I", data, offset)[0]
            offset += 4
            floor_id = raw & 0xFFFF
            roof_id  = (raw >> 16) & 0xFFFF
            tiles.append({"floor": floor_id, "roof": roof_id})
        elevations.append({
            "width":  MAP_WIDTH,
            "height": MAP_HEIGHT,
            "tiles":  tiles,
        })

    return elevations, offset


# ── Scripts section ───────────────────────────────────────────────────────────

# Script instance record sizes vary by type.  Each record starts with a
# common 4-word (16-byte) prefix; extra words follow depending on type.
_SCRIPT_COMMON_FMT = "<iiii"    # pid, next, type-data, num_procs
_SCRIPT_COMMON_SIZE = struct.calcsize(_SCRIPT_COMMON_FMT)   # 16

# Extra words per script type after the 16-byte common header
_SCRIPT_EXTRA_WORDS = {
    0: 0,   # none
    1: 1,   # spatial   — 1 extra int (tile trigger range/position)
    2: 3,   # time      — 3 extra ints (interval, game ticks, elapsed)
    3: 0,   # item
    4: 0,   # critter
}


def parse_scripts(data: bytes, offset: int) -> Tuple[List[dict], int]:
    """
    Parse the scripts section.
    The section starts with a total script count (int32), followed by that
    many script records.
    """
    if offset + 4 > len(data):
        return [], offset

    script_count = struct.unpack_from("<i", data, offset)[0]
    offset += 4

    scripts: List[dict] = []
    for _ in range(script_count):
        if offset + _SCRIPT_COMMON_SIZE > len(data):
            break

        pid, next_idx, type_data, num_procs = struct.unpack_from(
            _SCRIPT_COMMON_FMT, data, offset
        )
        offset += _SCRIPT_COMMON_SIZE

        stype    = (pid >> 24) & 0xFF
        stype_name = SCRIPT_TYPE.get(stype, str(stype))
        extra_n  = _SCRIPT_EXTRA_WORDS.get(stype, 0)
        extra: List[int] = []
        for _ in range(extra_n):
            if offset + 4 > len(data):
                break
            extra.append(struct.unpack_from("<i", data, offset)[0])
            offset += 4

        scripts.append({
            "pid":        pid,
            "type":       stype_name,
            "next":       next_idx,
            "type_data":  type_data,
            "extra":      extra,
        })

    return scripts, offset


# ── Objects section ───────────────────────────────────────────────────────────

# Common object header (72 bytes = 18 × int32, all little-endian)
_OBJ_HDR_FMT  = "<18i"
_OBJ_HDR_SIZE = struct.calcsize(_OBJ_HDR_FMT)   # 72


def _decode_fid(fid: int) -> dict:
    """Decode a Fallout FRM ID into its component parts."""
    return {
        "raw":       fid,
        "type":      (fid >> 24) & 0xFF,         # object type category
        "direction": (fid >> 16) & 0x0F,         # animation direction set
        "frame_num": (fid >> 12) & 0x0F,         # (legacy/unused)
        "art_idx":   fid & 0x00000FFF,            # index into the art directory
    }


def _decode_proto_id(pid: int) -> dict:
    """Decode a Fallout prototype ID."""
    ptype = (pid >> 24) & 0xFF
    return {
        "raw":   pid,
        "type":  PROTO_TYPE.get(ptype, str(ptype)),
        "index": pid & 0x00FFFFFF,
    }


def parse_object(data: bytes, offset: int) -> Tuple[Optional[dict], int]:
    """
    Parse a single object record.  Returns (obj_dict, new_offset).

    Common header fields (indices into the 18-int tuple):
      0  unknown1       (always 0)
      1  obj_id         unique object identifier within the map
      2  hex_pos        tile position (-1 = in inventory, not on map)
      3  level          elevation (0-2)
      4  anim_frame     current animation frame index
      5  direction      current facing direction (0-5)
      6  fid            FRM image ID
      7  flags          bitmask (walkable, transparent, flat, etc.)
      8  elevation      elevation again (mirrors field 3; here for grid calc)
      9  proto_id       prototype file ID (type + index)
     10  critter_idx    critter array index (-1 if not a critter)
     11  light_radius
     12  light_intensity
     13  outline        outline colour index
     14  script_id      attached script instance (-1 = none)
     15  owner_id       inventory owner object ID (-1 = on map)
     16  reserved1
     17  reserved2

    After the common header, type-specific extra data may follow.
    For Phase 2 we only need position + proto_id, so we skip extras
    by reading them as raw bytes and storing them opaquely.
    """
    if offset + _OBJ_HDR_SIZE > len(data):
        return None, offset

    ints = struct.unpack_from(_OBJ_HDR_FMT, data, offset)
    offset += _OBJ_HDR_SIZE

    proto_id = ints[9]
    obj_type = (proto_id >> 24) & 0xFF

    obj: dict = {
        "obj_id":    ints[1],
        "hex_pos":   ints[2],
        "elevation": ints[3],
        "direction": ints[5],
        "fid":       _decode_fid(ints[6]),
        "flags":     ints[7],
        "proto":     _decode_proto_id(proto_id),
        "light":     {"radius": ints[11], "intensity": ints[12]},
        "script_id": ints[14],
        "owner_id":  ints[15],
    }

    # Skip type-specific trailing data so the file pointer advances correctly.
    # Extra sizes per type (bytes after the 72-byte common header):
    #   0 item    : 12 bytes (current_hp, opened_flags, inventory_size)
    #   1 critter : variable — skip to next object via a sub-header
    #   2 scenery : 12 bytes
    #   3 wall    : 8  bytes
    #   4 tile    : 0  bytes
    #   5 misc    : 0  bytes
    extra_sizes = {0: 12, 1: 0, 2: 12, 3: 8, 4: 0, 5: 0}
    extra_len = extra_sizes.get(obj_type, 0)

    if obj_type == 1:
        # Critter objects carry a variable-length sub-record.
        # The sub-record starts with an int32 count of inventory items,
        # each 8 bytes.  We skip all of it.
        if offset + 4 <= len(data):
            inv_size = struct.unpack_from("<i", data, offset)[0]
            offset += 4
            # Additional critter-specific words before inventory
            # (AI packet, team, stats, etc.) — 36 bytes empirically
            offset += 36
            offset += max(0, inv_size) * 8
    else:
        # Read and store any extra bytes for completeness
        if extra_len > 0 and offset + extra_len <= len(data):
            obj["_extra"] = data[offset : offset + extra_len].hex()
            offset += extra_len

    return obj, offset


def parse_objects(data: bytes, offset: int) -> Tuple[List[dict], int]:
    """Parse the objects section (one block per elevation)."""
    all_objects: List[dict] = []

    for elev in range(NUM_ELEVATIONS):
        if offset + 4 > len(data):
            break
        count = struct.unpack_from("<i", data, offset)[0]
        offset += 4

        for _ in range(count):
            obj, offset = parse_object(data, offset)
            if obj is not None:
                all_objects.append(obj)

    return all_objects, offset


# ── Main converter ────────────────────────────────────────────────────────────

def convert_map(map_path: Path, out_path: Path) -> bool:
    """Convert a single .MAP file to JSON. Returns True on success."""
    try:
        data = map_path.read_bytes()
        offset = 0

        # Header
        header, offset = parse_header(data)

        # Local + global variables
        lvars, offset = parse_variables(data, offset, header["lvar_count"])
        gvars, offset = parse_variables(data, offset, header["gvar_count"])

        # Tile data
        elevations, offset = parse_tiles(data, offset)

        # Scripts (best-effort — corrupt data here doesn't abort)
        try:
            scripts, offset = parse_scripts(data, offset)
        except Exception as exc:
            print(f"  WARN scripts section: {exc}", file=sys.stderr)
            scripts = []

        # Objects (best-effort)
        try:
            objects, offset = parse_objects(data, offset)
        except Exception as exc:
            print(f"  WARN objects section: {exc}", file=sys.stderr)
            objects = []

        result: Dict[str, Any] = {
            "source":     map_path.name,
            "header":     header,
            "lvars":      lvars,
            "gvars":      gvars,
            "elevations": elevations,
            "scripts":    scripts,
            "objects":    objects,
        }

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2))

        tile_count = sum(
            sum(1 for t in e["tiles"] if t["floor"] or t["roof"])
            for e in elevations
        )
        print(
            f"  OK   {map_path.name:<20} "
            f"objects={len(objects)} scripts={len(scripts)} "
            f"non-empty-tiles={tile_count}"
        )
        return True

    except Exception as exc:
        print(f"  FAIL {map_path.name}: {exc}", file=sys.stderr)
        return False


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Convert Fallout 1 .MAP files to JSON."
    )
    ap.add_argument("input",  help="Input .MAP file or directory")
    ap.add_argument("output", help="Output .json file or directory")
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output)

    if inp.is_file():
        out_file = out if out.suffix == ".json" else out / (inp.stem.lower() + ".json")
        ok = convert_map(inp, out_file)
        sys.exit(0 if ok else 1)

    elif inp.is_dir():
        files = sorted({
            p for p in inp.rglob("*")
            if p.suffix.upper() == ".MAP" and p.is_file()
        })
        ok_n = err_n = 0
        for f in files:
            rel    = f.parent.relative_to(inp)
            target = out / rel / (f.stem.lower() + ".json")
            if convert_map(f, target):
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
