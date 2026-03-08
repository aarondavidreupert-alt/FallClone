#!/usr/bin/env python3
"""
frm_to_png.py — Converts Fallout 1 .FRM sprite/tile files to PNG spritesheets.

FRM (Fallout Resource Model) stores 2D animation data as palette-indexed pixels
across up to 6 directions (N, NE, SE, S, SW, NW for critters; 1 direction for
tiles and items). Each direction contains one or more animation frames.

The pixel data is indexed colour and requires COLOR.PAL to resolve to RGB.
Palette index 0 is treated as fully transparent (alpha = 0).

Output per FRM file
-------------------
  <stem>.png   Spritesheet: columns = frames, rows = directions (RGBA)
  <stem>.json  Sprite metadata: fps, cell size, per-frame offsets/shifts

FRM format reference (big-endian throughout)
--------------------------------------------
Header (62 bytes):
  uint32  version          always 4
  uint16  fps              animation speed in frames per second
  uint16  action_frame     frame index at which the action occurs (shot, etc.)
  uint16  frames_per_dir   number of frames per direction
  int16   shift_x[6]       x pixel shift for each of the 6 directions
  int16   shift_y[6]       y pixel shift for each of the 6 directions
  uint32  frame_offsets[6] byte offset from the start of the frame-data block
                           to the first frame of that direction
  uint32  frame_data_size  total size of the frame-data block in bytes

Frame header (12 bytes, repeated for every frame):
  uint16  width
  uint16  height
  uint32  data_size        always width * height
  int16   shift_x          per-frame x offset (used for weapon offsets, etc.)
  int16   shift_y          per-frame y offset

Then data_size bytes of raw palette indices (one byte per pixel, row-major).

PAL format (COLOR.PAL, 768 bytes)
----------------------------------
  256 colours × 3 bytes each (R, G, B).
  Values are 6-bit (0-63); multiply by 4 to reach 8-bit (0-255).

Usage
-----
  # single file
  python frm_to_png.py critters/HFMAAT.frm assets/sprites/ --palette raw_assets/COLOR.PAL

  # whole directory (recursive)
  python frm_to_png.py raw_assets/art/critters/ assets/sprites/ --palette raw_assets/COLOR.PAL

  # tiles
  python frm_to_png.py raw_assets/art/tiles/ assets/tiles/ --palette raw_assets/COLOR.PAL --ext FRM
"""

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import List, NamedTuple, Optional, Tuple

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required.  pip install Pillow", file=sys.stderr)
    sys.exit(1)


# ── Constants ─────────────────────────────────────────────────────────────────

NUM_DIRECTIONS = 6
DIRECTION_NAMES = ["north", "northeast", "southeast", "south", "southwest", "northwest"]

# FRM header: big-endian
_HDR_FMT  = ">IHHH6h6h6II"
_HDR_SIZE = struct.calcsize(_HDR_FMT)   # 62 bytes

# Frame header: big-endian
_FRAME_FMT  = ">HHIhh"
_FRAME_SIZE = struct.calcsize(_FRAME_FMT)   # 12 bytes


# ── Data classes ──────────────────────────────────────────────────────────────

class FrmFrame(NamedTuple):
    width:   int
    height:  int
    shift_x: int
    shift_y: int
    pixels:  bytes   # palette indices, length == width * height


class FrmDirection(NamedTuple):
    dir_index: int   # 0-5
    frames:    List[FrmFrame]


class FrmFile(NamedTuple):
    version:         int
    fps:             int
    action_frame:    int
    frames_per_dir:  int
    dir_shift_x:     List[int]   # length 6
    dir_shift_y:     List[int]   # length 6
    frame_offsets:   List[int]   # length 6, byte offsets into frame-data block
    frame_data_size: int
    directions:      List[FrmDirection]


# ── Palette ───────────────────────────────────────────────────────────────────

Palette = List[Tuple[int, int, int]]


def load_palette(path: Path) -> Palette:
    """Load a 768-byte Fallout VGA palette file (COLOR.PAL)."""
    data = path.read_bytes()
    if len(data) < 768:
        raise ValueError(f"Palette file too small: {len(data)} bytes (expected 768)")
    colours: Palette = []
    for i in range(256):
        r = min(data[i * 3]     * 4, 255)
        g = min(data[i * 3 + 1] * 4, 255)
        b = min(data[i * 3 + 2] * 4, 255)
        colours.append((r, g, b))
    return colours


def _greyscale_palette() -> Palette:
    """Fallback palette used when COLOR.PAL is not available."""
    return [(v, v, v) for v in range(256)]


def _find_palette(hint: Optional[Path] = None) -> Optional[Path]:
    """Search common locations for COLOR.PAL."""
    candidates = [
        hint,
        Path("raw_assets/COLOR.PAL"),
        Path("raw_assets/art/COLOR.PAL"),
        Path("COLOR.PAL"),
    ]
    for p in candidates:
        if p is not None and p.exists():
            return p
    return None


# ── FRM parser ────────────────────────────────────────────────────────────────

def parse_frm(data: bytes) -> FrmFile:
    """Parse raw FRM bytes into a FrmFile structure."""
    if len(data) < _HDR_SIZE:
        raise ValueError(f"Data too short for FRM header: {len(data)} bytes")

    fields = struct.unpack_from(_HDR_FMT, data, 0)
    version         = fields[0]
    fps             = fields[1]
    action_frame    = fields[2]
    frames_per_dir  = fields[3]
    dir_shift_x     = list(fields[4:10])
    dir_shift_y     = list(fields[10:16])
    frame_offsets   = list(fields[16:22])
    frame_data_size = fields[22]

    frame_block_start = _HDR_SIZE  # 62

    # Determine which directions carry unique frame data.
    # Directions that share an identical offset point to the same frame block
    # (e.g. items with no rotation have all 6 offsets identical).
    seen: dict = {}
    directions: List[FrmDirection] = []

    for d_idx in range(NUM_DIRECTIONS):
        offset = frame_offsets[d_idx]
        if offset in seen:
            continue          # already parsed this block
        seen[offset] = d_idx

        pos = frame_block_start + offset
        frames: List[FrmFrame] = []

        for _ in range(frames_per_dir):
            if pos + _FRAME_SIZE > len(data):
                break         # truncated

            w, h, data_size, fsx, fsy = struct.unpack_from(_FRAME_FMT, data, pos)
            pos += _FRAME_SIZE

            pixel_count = w * h
            available   = len(data) - pos
            read_len    = min(data_size, pixel_count, available)
            pixels      = data[pos : pos + read_len]

            # Pad with zeros (transparent) if the file is truncated
            if len(pixels) < pixel_count:
                pixels = pixels + bytes(pixel_count - len(pixels))

            pos += data_size   # advance by the amount declared in the header
            frames.append(FrmFrame(w, h, fsx, fsy, pixels))

        directions.append(FrmDirection(d_idx, frames))

    return FrmFile(
        version, fps, action_frame, frames_per_dir,
        dir_shift_x, dir_shift_y, frame_offsets, frame_data_size,
        directions,
    )


# ── Spritesheet builder ───────────────────────────────────────────────────────

def _pixels_to_rgba(pixels: bytes, w: int, h: int, palette: Palette) -> bytes:
    """Convert palette-indexed pixel bytes to flat RGBA bytes."""
    buf = bytearray(w * h * 4)
    for i, idx in enumerate(pixels):
        if idx == 0:
            # Index 0 = transparent (background colour, never drawn)
            buf[i * 4 : i * 4 + 4] = b"\x00\x00\x00\x00"
        else:
            r, g, b = palette[idx]
            buf[i * 4]     = r
            buf[i * 4 + 1] = g
            buf[i * 4 + 2] = b
            buf[i * 4 + 3] = 0xFF
    return bytes(buf)


def build_spritesheet(frm: FrmFile, palette: Palette) -> Tuple[Image.Image, dict]:
    """
    Arrange all frames into a single RGBA PNG.

    Layout:
      - One row per direction (top = direction 0)
      - One column per frame  (left = frame 0)
      - Each cell is max_frame_width × max_frame_height, padded with transparency

    Returns (PIL Image, metadata dict).
    """
    dirs = frm.directions
    if not dirs or not any(d.frames for d in dirs):
        raise ValueError("FRM contains no frames")

    all_frames = [f for d in dirs for f in d.frames]
    cell_w = max(f.width  for f in all_frames) if all_frames else 1
    cell_h = max(f.height for f in all_frames) if all_frames else 1
    num_dirs   = len(dirs)
    num_frames = max(len(d.frames) for d in dirs)

    sheet = Image.new("RGBA", (cell_w * num_frames, cell_h * num_dirs), (0, 0, 0, 0))

    frame_meta: list = []
    for row, d in enumerate(dirs):
        for col, frame in enumerate(d.frames):
            rgba = _pixels_to_rgba(frame.pixels, frame.width, frame.height, palette)
            cell = Image.frombytes("RGBA", (frame.width, frame.height), rgba)
            x = col * cell_w
            y = row * cell_h
            sheet.paste(cell, (x, y))
            frame_meta.append({
                "direction":  d.dir_index,
                "dir_name":   DIRECTION_NAMES[d.dir_index],
                "frame":      col,
                "x":          x,
                "y":          y,
                "width":      frame.width,
                "height":     frame.height,
                "shift_x":    frame.shift_x,
                "shift_y":    frame.shift_y,
            })

    metadata = {
        "fps":            frm.fps,
        "action_frame":   frm.action_frame,
        "frames_per_dir": num_frames,
        "num_directions": num_dirs,
        "cell_width":     cell_w,
        "cell_height":    cell_h,
        "sheet_width":    cell_w * num_frames,
        "sheet_height":   cell_h * num_dirs,
        "dir_shift_x":    frm.dir_shift_x,
        "dir_shift_y":    frm.dir_shift_y,
        "frames":         frame_meta,
    }

    return sheet, metadata


# ── Per-file conversion ───────────────────────────────────────────────────────

def convert_file(
    frm_path: Path,
    out_dir:  Path,
    palette:  Palette,
    rel_sub:  str = "",
) -> bool:
    """Convert a single .FRM file and write <stem>.png + <stem>.json."""
    target = out_dir / rel_sub if rel_sub else out_dir
    target.mkdir(parents=True, exist_ok=True)
    stem = frm_path.stem.lower()

    try:
        raw         = frm_path.read_bytes()
        frm         = parse_frm(raw)
        sheet, meta = build_spritesheet(frm, palette)

        sheet.save(target / f"{stem}.png", "PNG")
        (target / f"{stem}.json").write_text(json.dumps(meta, indent=2))

        dirs_str = f"{len(frm.directions)}dir"
        fps_str  = f"{frm.fps}fps"
        frames_str = f"{frm.frames_per_dir}f"
        print(f"  OK   {frm_path.name:<30} {dirs_str} {fps_str} {frames_str}")
        return True

    except Exception as exc:
        print(f"  FAIL {frm_path.name}: {exc}", file=sys.stderr)
        return False


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Convert Fallout 1 .FRM files to RGBA PNG spritesheets."
    )
    ap.add_argument("input",  help="Input .frm file or directory")
    ap.add_argument("output", help="Output directory")
    ap.add_argument(
        "--palette", default="",
        help="Path to COLOR.PAL (searched automatically if omitted)",
    )
    ap.add_argument(
        "--ext", default="frm",
        help="File extension filter when input is a directory (default: frm)",
    )
    ap.add_argument(
        "--flat", action="store_true",
        help="Write all output files into a single flat directory (no subdirs)",
    )
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output)

    # ── Palette ──
    pal_hint = Path(args.palette) if args.palette else None
    pal_path = _find_palette(pal_hint)
    if pal_path:
        palette = load_palette(pal_path)
        print(f"Palette : {pal_path}")
    else:
        palette = _greyscale_palette()
        print("WARNING : COLOR.PAL not found — using greyscale placeholder", file=sys.stderr)

    out.mkdir(parents=True, exist_ok=True)

    if inp.is_file():
        ok = convert_file(inp, out, palette)
        sys.exit(0 if ok else 1)

    elif inp.is_dir():
        # Collect both lowercase and uppercase extensions, deduplicated
        ext = args.ext.lstrip(".")
        files: list[Path] = sorted({
            p for p in inp.rglob("*")
            if p.suffix.lower() == f".{ext.lower()}" and p.is_file()
        })
        ok_count = err_count = 0
        for f in files:
            sub = "" if args.flat else str(f.parent.relative_to(inp))
            if convert_file(f, out, palette, sub):
                ok_count += 1
            else:
                err_count += 1
        print(f"\nResult  : {ok_count} converted, {err_count} failed")
        sys.exit(0 if err_count == 0 else 1)

    else:
        print(f"ERROR: {inp} is not a file or directory", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
