#!/usr/bin/env python3
"""
convert_all.py — Master asset conversion script for the Fallout 1 Browser Clone.

Runs all five individual converters in sequence, walking the raw_assets/
directory tree and routing each file type to the correct output directory
under assets/.

Expected raw_assets layout (mirrors the original Fallout 1 data directory):
  raw_assets/
    COLOR.PAL                    — global 256-colour VGA palette
    art/
      critters/  *.FRM             → assets/sprites/critters/
      tiles/     *.FRM             → assets/tiles/
      items/     *.FRM             → assets/sprites/items/
      intrface/  *.FRM             → assets/ui/
      backgrnd/  *.FRM             → assets/sprites/backgrounds/
      misc/      *.FRM             → assets/sprites/misc/
      skilldex/  *.FRM             → assets/sprites/skilldex/
    maps/        *.MAP             → assets/maps/
    proto/
      items/     *.PRO             → assets/data/proto/items/
      critters/  *.PRO             → assets/data/proto/critters/
      scenery/   *.PRO             → assets/data/proto/scenery/
      walls/     *.PRO             → assets/data/proto/walls/
      tiles/     *.PRO             → assets/data/proto/tiles/
      misc/      *.PRO             → assets/data/proto/misc/
    text/
      english/   **/*.MSG          → assets/data/text/
    sound/
      music/     *.ACM             → assets/audio/music/
      sfx/       *.ACM             → assets/audio/sfx/
      ambient/   *.ACM             → assets/audio/ambient/

Usage
----
  # Default paths (raw_assets/ → assets/)
  python tools/convert_all.py

  # Custom paths
  python tools/convert_all.py --raw raw_assets/ --out assets/

  # Skip individual converters
  python tools/convert_all.py --skip-audio --skip-maps

  # Show what would be converted without doing it
  python tools/convert_all.py --dry-run
"""

import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Tuple


# ── Script loader helper ────

def _load_converter(script_path: Path):
    """Dynamically import a converter module so we can call its functions."""
    spec   = importlib.util.spec_from_file_location(script_path.stem, script_path)
    module = importlib.util.module_from_spec(spec)       # type: ignore[arg-type]
    spec.loader.exec_module(module)                    # type: ignore[union-attr]
    return module


# ── FRM routing ────

# Maps subdirectory names under raw_assets/art/ to output dirs under assets/
_FRM_ROUTES: List[Tuple[str, str]] = [
    ("critters",  "sprites/critters"),
    ("tiles",     "tiles"),
    ("items",     "sprites/items"),
    ("intrface",  "ui"),
    ("backgrnd",  "sprites/backgrounds"),
    ("misc",      "sprites/misc"),
    ("skilldex",  "sprites/skilldex"),
    ("heads",     "sprites/heads"),
    ("fonts",     "ui/fonts"),
    ("iface",     "ui"),
]


def _run_frm(raw: Path, out: Path, pal_path: Path, dry: bool, frm_mod, incremental: bool = False) -> Tuple[int, int]:
    ok = err = 0
    art_root = raw / "art"
    if not art_root.is_dir():
        print(f"  (skip) art/ not found in {raw}")
        return 0, 0

    # Apply configured routes first
    routed_dirs = set()
    for sub_name, out_sub in _FRM_ROUTES:
        sub_dir = art_root / sub_name
        if not sub_dir.is_dir():
            continue
        routed_dirs.add(sub_name)
        target = out / out_sub
        files = sorted({
            p for p in sub_dir.rglob("*")
            if p.suffix.upper() == ".FRM" and p.is_file()
        })
        print(f"\n  art/{sub_name}/  ({len(files)} FRM) → {target.relative_to(out)}/")
        if dry:
            ok += len(files)
            continue
        for f in files:
            rel = str(f.parent.relative_to(sub_dir))
            out_png = (target / rel / (f.stem.lower() + ".png")) if rel and rel != "." else (target / (f.stem.lower() + ".png"))
            if incremental and out_png.exists():
                ok += 1   # count as success — already done
                continue
            if frm_mod.convert_file(f, target, frm_mod.load_palette(pal_path) if pal_path.exists()
                    else frm_mod._greyscale_palette(), rel):
                ok += 1
            else:
                err += 1

    # Catch any remaining art subdirs not in the route table
    for d in sorted(art_root.iterdir()):
        if not d.is_dir() or d.name in routed_dirs:
            continue
        target = out / f"sprites/{d.name.lower()}"
        files = sorted({p for p in d.rglob("*") if p.suffix.upper() == ".FRM"})
        if not files:
            continue
        print(f"\n  art/{d.name}/  ({len(files)} FRM) → {target.relative_to(out)}/")
        if dry:
            ok += len(files)
            continue
        pal = frm_mod.load_palette(pal_path) if pal_path.exists() else frm_mod._greyscale_palette()
        for f in files:
            rel = str(f.parent.relative_to(d))
            out_png = (target / rel / (f.stem.lower() + ".png")) if rel and rel != "." else (target / (f.stem.lower() + ".png"))
            if incremental and out_png.exists():
                ok += 1
                continue
            if frm_mod.convert_file(f, target, pal, rel):
                ok += 1
            else:
                err += 1

    return ok, err


# ── MAP routing ────

def _run_maps(raw: Path, out: Path, dry: bool, map_mod, incremental: bool = False) -> Tuple[int, int]:
    ok = err = 0
    maps_dir = raw / "maps"
    if not maps_dir.is_dir():
        print(f"  (skip) maps/ not found in {raw}")
        return 0, 0

    files = sorted({p for p in maps_dir.rglob("*") if p.suffix.upper() == ".MAP" and p.is_file()})
    target = out / "maps"
    print(f"\n  maps/  ({len(files)} MAP) → {target.relative_to(out)}/")
    if dry:
        return len(files), 0

    target.mkdir(parents=True, exist_ok=True)
    for f in files:
        rel    = f.parent.relative_to(maps_dir)
        out_f  = target / rel / (f.stem.lower() + ".json")
        if incremental and out_f.exists():
            ok += 1
            continue
        if map_mod.convert_map(f, out_f):
            ok += 1
        else:
            err += 1
    return ok, err


# ── MSG routing ────

def _run_msg(raw: Path, out: Path, dry: bool, msg_mod, incremental: bool = False) -> Tuple[int, int]:
    ok = err = 0
    text_root = raw / "text"
    if not text_root.is_dir():
        print(f"  (skip) text/ not found in {raw}")
        return 0, 0

    files = sorted({p for p in text_root.rglob("*") if p.suffix.lower() == ".msg"  # .msg only — explicitly excludes .map and other formats
        and p.is_file()})
    target = out / "data" / "text"
    print(f"\n  text/  ({len(files)} MSG) → {target.relative_to(out)}/")
    if dry:
        return len(files), 0

    for f in files:
        rel    = f.parent.relative_to(text_root)
        out_f  = target / rel / (f.stem.lower() + ".json")
        if incremental and out_f.exists():
            ok += 1
            continue
        if msg_mod.convert_file(f, out_f):
            ok += 1
        else:
            err += 1
    return ok, err


# ── PRO routing ────

def _run_pro(raw: Path, out: Path, dry: bool, pro_mod, incremental: bool = False) -> Tuple[int, int]:
    ok = err = 0
    # Fallout 1 ships with uppercase PROTO/; user installs may have different casing.
    _proto_candidates = ["PROTO", "proto", "protos", "Protos"]
    proto_root = next((raw / c for c in _proto_candidates if (raw / c).is_dir()), None)
    if proto_root is None:
        print(f"  (skip) proto directory not found in {raw} "
              f"(tried: {', '.join(_proto_candidates + ['/']).rstrip('/')})")
        return 0, 0

    files = sorted({p for p in proto_root.rglob("*") if p.suffix.upper() == ".PRO" and p.is_file()})
    target = out / "data" / "proto"
    print(f"\n  {proto_root.name}/ ({len(files)} PRO) → {target.relative_to(out)}/")
    if dry:
        return len(files), 0

    for f in files:
        rel    = f.parent.relative_to(proto_root)
        out_f  = target / rel / (f.stem.lower() + ".json")
        if incremental and out_f.exists():
            ok += 1
            continue
        if pro_mod.convert_file(f, out_f):
            ok += 1
        else:
            err += 1
    return ok, err


# ── ACM routing ────

def _run_acm(
    raw: Path, out: Path, fmt: str, quality: int, dry: bool, acm_mod,
    incremental: bool = False,
) -> Tuple[int, int]:
    ok = err = 0
    sound_root = raw / "sound"
    if not sound_root.is_dir():
        print(f"  (skip) sound/ not found in {raw}")
        return 0, 0

    try:
        ffmpeg = acm_mod.check_ffmpeg()
    except RuntimeError as exc:
        print(f"  (skip audio) {exc}", file=sys.stderr)
        return 0, 0

    files = sorted({
        p for p in sound_root.rglob("*")
        if p.suffix.upper() == ".ACM" and p.is_file()
    })
    target = out / "audio"
    print(f"\n  sound/ ({len(files)} ACM) → {target.relative_to(out)}/ [{fmt}]")
    if dry:
        return len(files), 0

    for f in files:
        rel      = str(f.parent.relative_to(sound_root))
        out_dir2 = target / rel if rel and rel != "." else target
        out_f    = out_dir2 / f"{f.stem.lower()}.{fmt}"
        if incremental and out_f.exists():
            ok += 1
            continue
        if acm_mod.convert_acm(f, target, fmt, quality, ffmpeg, rel):
            ok += 1
        else:
            err += 1
    return ok, err


# ── Manifest writer ────

def write_manifest(out: Path) -> None:
    """Write assets/manifest.json listing every converted asset."""
    import json
    manifest: dict = {}
    for ext in ("png", "json", "mp3", "ogg"):
        files = sorted(str(p.relative_to(out)) for p in out.rglob(f"*.{ext}"))
        if files:
            manifest[ext] = files

    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    total = sum(len(v) for v in manifest.values())
    print(f"\n  Manifest: {manifest_path}  ({total} assets indexed)")


# ── LST lookup generator ────

def generate_lst_lookups(raw: Path, out: Path) -> None:
    """
    Read all .LST files from raw_assets/art/ and write JSON lookup arrays
    to assets/data/ so the game engine can resolve art IDs to filenames.

    Output files (index 0 = reserved/empty, index N = art ID N):
      assets/data/tiles_lst.json
      assets/data/critters_lst.json
      assets/data/items_lst.json
      assets/data/scenery_lst.json
      assets/data/walls_lst.json
      assets/data/misc_lst.json
      assets/data/heads_lst.json
      assets/data/intrface_lst.json
      assets/data/skilldex_lst.json
      assets/data/inven_lst.json
    """
    import json

    LST_MAP = {
        "tiles":    raw / "art" / "tiles"    / "TILES.LST",
        "critters": raw / "art" / "critters" / "CRITTERS.LST",
        "items":    raw / "art" / "items"    / "ITEMS.LST",
        "scenery":  raw / "art" / "scenery"  / "SCENERY.LST",
        "walls":    raw / "art" / "wall"     / "WALLS.LST",
        "misc":     raw / "art" / "misc"     / "MISC.LST",
        "heads":    raw / "art" / "heads"    / "HEADS.LST",
        "intrface": raw / "art" / "intrface" / "INTRFACE.LST",
        "skilldex": raw / "art" / "skilldex" / "SKILLDEX.LST",
        "inven":    raw / "art" / "inven"    / "INVEN.LST",
    }

    data_dir = out / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    print("\n  LST lookups:")
    for name, lst_path in LST_MAP.items():
        if not lst_path.exists():
            print(f"    (skip) {lst_path.name} not found")
            continue

        entries: list = [""]   # index 0 = reserved/empty
        with open(lst_path, "r", errors="replace") as f:
            for line in f:
                stem = line.strip().split(";")[0].strip()   # strip comments
                stem = stem.split(",")[0].strip()            # strip ,framecount
                stem = Path(stem).stem.lower() if stem else ""
                entries.append(stem)

        out_path = data_dir / f"{name}_lst.json"
        out_path.write_text(json.dumps(entries, indent=2))
        print(f"    {lst_path.name:<16} → data/{name}_lst.json  ({len(entries)-1} entries)")


# ── Entry point ────

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Master Fallout 1 asset conversion pipeline."
    )
    ap.add_argument("--raw",     default="raw_assets", help="Root of raw Fallout 1 data (default: raw_assets/)")
    ap.add_argument("--out",     default="assets",     help="Output root (default: assets/)")
    ap.add_argument("--palette", default="",           help="Path to COLOR.PAL (auto-detected if omitted)")
    ap.add_argument("--audio-format", choices=["mp3", "ogg"], default="mp3",
                    help="Output audio format (default: mp3)")
    ap.add_argument("--audio-quality", type=int, default=4,
                    help="ffmpeg -q:a quality (MP3: 0=best, 9=worst; default 4)")
    ap.add_argument("--skip-sprites", action="store_true")
    ap.add_argument("--skip-tiles",   action="store_true")
    ap.add_argument("--skip-maps",    action="store_true")
    ap.add_argument("--skip-text",    action="store_true")
    ap.add_argument("--skip-proto",   action="store_true")
    ap.add_argument("--skip-audio",   action="store_true")
    ap.add_argument("--dry-run",      action="store_true",
                    help="Show what would be converted without writing files")
    ap.add_argument("--full",         action="store_true",
                    help="Reconvert all files even if output already exists "
                    "(default: skip files whose output is already present)")
    args = ap.parse_args()

    raw = Path(args.raw)
    out = Path(args.out)
    dry = args.dry_run

    # ── Incremental mode ────
    # Ask the user (interactive TTY) whether to skip existing output files.
    # Non-interactive runs (CI, pipes) default to incremental (safe & fast).
    if args.full:
        incremental = False
    elif dry:
        incremental = False   # dry-run always shows everything
    elif sys.stdin.isatty():
        print()
        ans = input(
            "Convert missing files only? [Y] or reconvert everything? [N]  "
            "(default Y): "
        ).strip().upper()
        incremental = (ans != "N")
    else:
        incremental = True    # non-interactive: skip existing by default

    if not raw.is_dir():
        print(f"ERROR: raw assets directory not found: {raw}", file=sys.stderr)
        print(
            "  Place your Fallout 1 data files in raw_assets/ and re-run.\n"
            "  Expected structure: raw_assets/art/, raw_assets/maps/, etc.",
            file=sys.stderr,
        )
        sys.exit(1)

    tools = Path(__file__).parent

    # Load converter modules
    frm_mod = _load_converter(tools / "frm_to_png.py")
    map_mod = _load_converter(tools / "map_to_json.py")
    msg_mod = _load_converter(tools / "msg_to_json.py")
    pro_mod = _load_converter(tools / "pro_to_json.py")
    acm_mod = _load_converter(tools / "acm_to_mp3.py")

    # Locate palette
    pal_candidates = [
        Path(args.palette) if args.palette else None,
        raw / "COLOR.PAL",
        raw / "art" / "COLOR.PAL",
    ]
    pal_path = next((p for p in pal_candidates if p is not None and p.exists()), raw / "COLOR.PAL")

    out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()

    total_ok = total_err = 0

    print("=" * 60)
    print(f"Fallout 1 Asset Conversion Pipeline")
    print(f"  source : {raw.resolve()}")
    print(f"  output : {out.resolve()}")
    print(f"  palette: {pal_path} {'(found)' if pal_path.exists() else '(MISSING — greyscale)'}")
    mode_label = "DRY RUN" if dry else (
        "incremental (skip existing output)" if incremental else "full (reconvert all)"
    )
    print(f"  mode   : {mode_label}")
    print("=" * 60)

    # ── FRM sprites & tiles ──
    if not args.skip_sprites and not args.skip_tiles:
        print("\n[1/5] FRM sprites + tiles")
        ok, err = _run_frm(raw, out, pal_path, dry, frm_mod, incremental)
        total_ok += ok; total_err += err
        print(f"      {ok} ok, {err} failed")

    # ── MAP files ──
    if not args.skip_maps:
        print("\n[2/5] MAP → JSON")
        ok, err = _run_maps(raw, out, dry, map_mod, incremental)
        total_ok += ok; total_err += err
        print(f"      {ok} ok, {err} failed")

    # ── MSG dialogue ──
    if not args.skip_text:
        print("\n[3/5] MSG → JSON")
        ok, err = _run_msg(raw, out, dry, msg_mod, incremental)
        total_ok += ok; total_err += err
        print(f"      {ok} ok, {err} failed")

    # ── PRO prototypes ──
    if not args.skip_proto:
        print("\n[4/5] PRO → JSON")
        ok, err = _run_pro(raw, out, dry, pro_mod, incremental)
        total_ok += ok; total_err += err
        print(f"      {ok} ok, {err} failed")

    # ── ACM audio ──
    if not args.skip_audio:
        print("\n[5/5] ACM → audio")
        ok, err = _run_acm(raw, out, args.audio_format, args.audio_quality, dry, acm_mod, incremental)
        total_ok += ok; total_err += err
        print(f"      {ok} ok, {err} failed")

    # ── Manifest ──
    if not dry:
        write_manifest(out)

    # ── LST lookups ──
    if not dry:
        print("\n[+] Generating LST lookup JSONs")
        generate_lst_lookups(raw, out)

    elapsed = time.perf_counter() - t0
    print("=" * 60)
    print(f"Done in {elapsed:.1f}s — {total_ok} converted, {total_err} failed")
    print("=" * 60)
    sys.exit(0 if total_err == 0 else 1)


if __name__ == "__main__":
    main()

