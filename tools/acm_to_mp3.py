#!/usr/bin/env python3
"""
acm_to_mp3.py — Converts Fallout 1 .ACM audio files to MP3 or OGG via ffmpeg.

ACM (InterPlay Audio Compression Model) is a proprietary codec used by
Fallout 1/2 for all music and sound effects.  Modern ffmpeg includes a
built-in ACM decoder, so no extra plugin is required.

The output for each .ACM file is:
  <stem>.mp3     Lossy MP3 at quality VBR 4 (~165 kbps average)
  — or —
  <stem>.ogg     Ogg Vorbis at quality 4 (~128 kbps average)

Both formats are supported by all modern browsers.  MP3 has better
compatibility; OGG is fully open and slightly smaller.  The web engine
ships an <audio> fallback that tries MP3 first then OGG.

ffmpeg command used per file:
  ffmpeg -y -i <input.acm> [-q:a <quality>] <output.mp3|ogg>

Requirements
------------
  ffmpeg must be on PATH.  On Linux: sudo apt install ffmpeg
  On macOS: brew install ffmpeg

Usage
-----
  # single file → MP3
  python acm_to_mp3.py raw_assets/sound/music/DESERT.ACM  assets/audio/

  # whole directory → OGG
  python acm_to_mp3.py raw_assets/sound/  assets/audio/  --format ogg

  # explicit quality (MP3: 0=best/255kbps  9=smallest/45kbps; default 4)
  python acm_to_mp3.py raw_assets/sound/sfx/ assets/audio/sfx/ --quality 3
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_FORMAT  = "mp3"
DEFAULT_QUALITY = 4           # ffmpeg -q:a value (VBR; lower = better quality)


# ── ffmpeg helpers ────────────────────────────────────────────────────────────

def check_ffmpeg() -> str:
    """Return the path to ffmpeg or raise RuntimeError."""
    path = shutil.which("ffmpeg")
    if path is None:
        raise RuntimeError(
            "ffmpeg not found on PATH.\n"
            "  Ubuntu/Debian: sudo apt install ffmpeg\n"
            "  macOS:         brew install ffmpeg\n"
            "  Windows:       https://ffmpeg.org/download.html"
        )
    return path


def convert_acm(
    acm_path:   Path,
    out_dir:    Path,
    fmt:        str,
    quality:    int,
    ffmpeg_bin: str,
    rel_sub:    str = "",
) -> bool:
    """
    Convert a single .ACM file.  Returns True on success.

    ffmpeg flags:
      -y            overwrite without prompt
      -i <input>    input file (ffmpeg's built-in ACM decoder handles it)
      -q:a <n>      VBR quality (MP3: 0-9; OGG: 0-10 where 10=best)
      -vn           strip any video stream (ACM has none, but be safe)
      -ac 2         force stereo (some ACM files are mono; web audio prefers stereo)
      -ar 44100     resample to 44.1 kHz (CD quality, universally supported)
    """
    target = out_dir / rel_sub if rel_sub else out_dir
    target.mkdir(parents=True, exist_ok=True)
    out_file = target / f"{acm_path.stem.lower()}.{fmt}"

    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(acm_path),
        "-vn",
        "-ac", "2",
        "-ar", "44100",
        "-q:a", str(quality),
        str(out_file),
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace").strip()
            # Show only the last relevant ffmpeg error line
            last_err = next(
                (l for l in reversed(err.splitlines()) if l.strip()),
                err[:200],
            )
            print(f"  FAIL {acm_path.name}: {last_err}", file=sys.stderr)
            return False

        size_kb = out_file.stat().st_size // 1024
        print(f"  OK   {acm_path.name:<35} → {out_file.name} ({size_kb} KB)")
        return True

    except FileNotFoundError:
        print(f"  FAIL {acm_path.name}: ffmpeg not found", file=sys.stderr)
        return False
    except Exception as exc:
        print(f"  FAIL {acm_path.name}: {exc}", file=sys.stderr)
        return False


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    # ── Dependency check (before argument parsing) ────────────────────────────
    # Fail fast with clear instructions if ffmpeg is missing.
    try:
        ffmpeg = check_ffmpeg()
        print(f"ffmpeg found: {ffmpeg}")
    except RuntimeError as exc:
        print("=" * 60, file=sys.stderr)
        print("ERROR: ffmpeg is required but was not found on PATH.", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        print(str(exc), file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        sys.exit(1)

    ap = argparse.ArgumentParser(
        description="Convert Fallout 1 .ACM audio files to MP3 or OGG via ffmpeg."
    )
    ap.add_argument("input",   help="Input .acm file or directory")
    ap.add_argument("output",  help="Output directory")
    ap.add_argument(
        "--format", choices=["mp3", "ogg"], default=DEFAULT_FORMAT,
        help=f"Output audio format (default: {DEFAULT_FORMAT})",
    )
    ap.add_argument(
        "--quality", type=int, default=DEFAULT_QUALITY,
        help=(
            "ffmpeg -q:a value: MP3 0 (best/~255kbps) – 9 (worst/~45kbps), "
            f"default {DEFAULT_QUALITY}"
        ),
    )
    ap.add_argument(
        "--flat", action="store_true",
        help="Write all output files into a single flat directory (no subdirs)",
    )
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output)
    fmt = args.format
    q   = args.quality

    out.mkdir(parents=True, exist_ok=True)

    if inp.is_file():
        ok = convert_acm(inp, out, fmt, q, ffmpeg)
        sys.exit(0 if ok else 1)

    elif inp.is_dir():
        files = sorted({
            p for p in inp.rglob("*")
            if p.suffix.upper() == ".ACM" and p.is_file()
        })
        if not files:
            print(f"No .ACM files found in {inp}", file=sys.stderr)
            sys.exit(0)

        print(f"Converting {len(files)} .ACM files → .{fmt}  (quality={q})")
        ok_n = err_n = 0
        for f in files:
            sub = "" if args.flat else str(f.parent.relative_to(inp))
            if convert_acm(f, out, fmt, q, ffmpeg, sub):
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
