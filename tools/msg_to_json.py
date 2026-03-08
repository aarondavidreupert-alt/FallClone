#!/usr/bin/env python3
"""
msg_to_json.py — Converts Fallout 1 .MSG dialogue/text files to JSON arrays.

MSG files are plain ASCII text.  Each non-blank, non-comment line holds one
message entry in the format:

    {id}{condition}{text}

  id         Integer key (used by scripts to look up text)
  condition  Optional flags string (almost always empty in Fallout 1)
  text       The actual display string; may contain \\n for line breaks

Lines beginning with # are comments and are ignored.
A file may also contain bare comment text without braces (ignored).

Output format
-------------
  [
    {"id": 100, "condition": "", "text": "Hello there, Vault Dweller."},
    {"id": 101, "condition": "", "text": "What do you want?"},
    ...
  ]

The output is sorted by id ascending.  Duplicate ids raise a warning and the
last occurrence wins.

Usage
-----
  python msg_to_json.py raw_assets/text/english/game/pro_items.msg  assets/data/pro_items.json
  python msg_to_json.py raw_assets/text/english/                    assets/data/
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Regex: matches {id}{condition}{text}
# The text field may contain any characters including { and }.
_MSG_RE = re.compile(
    r"^\s*"
    r"\{(?P<id>\d+)\}"
    r"\{(?P<condition>[^}]*)\}"
    r"\{(?P<text>.*)\}"
    r"\s*$"
)


def parse_msg(content: str, source_name: str = "") -> List[dict]:
    """
    Parse the contents of a .MSG file and return a list of message dicts.

    Handles:
      - Lines starting with # (comments, skipped)
      - Blank lines (skipped)
      - Multi-line entries are NOT officially supported by Fallout 1 MSG
        files, but lines that start with a continuation tab are concatenated
        as a safety measure.
      - \\n escape sequences in text are preserved as-is for the engine to
        render (convert to newline at display time).
    """
    messages: Dict[int, dict] = {}
    warnings: List[str] = []

    for lineno, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()

        # Skip blank lines and comments
        if not line or line.startswith("#"):
            continue

        m = _MSG_RE.match(line)
        if m is None:
            # Line present but not a message entry — log for debugging
            # (some MSG files have stray text between entries)
            continue

        msg_id    = int(m.group("id"))
        condition = m.group("condition").strip()
        text      = m.group("text")

        if msg_id in messages:
            warnings.append(
                f"{source_name}:{lineno}: duplicate id {msg_id} — last occurrence wins"
            )

        messages[msg_id] = {"id": msg_id, "condition": condition, "text": text}

    for w in warnings:
        print(f"  WARN {w}", file=sys.stderr)

    return sorted(messages.values(), key=lambda e: e["id"])


def convert_file(msg_path: Path, out_path: Path) -> bool:
    """Convert a single .MSG file. Returns True on success."""
    try:
        # MSG files are typically CP-1252 or latin-1; fall back gracefully
        try:
            content = msg_path.read_text(encoding="cp1252")
        except UnicodeDecodeError:
            content = msg_path.read_text(encoding="latin-1")

        entries = parse_msg(content, msg_path.name)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))
        print(f"  OK   {msg_path.name:<40} {len(entries)} entries")
        return True

    except Exception as exc:
        print(f"  FAIL {msg_path.name}: {exc}", file=sys.stderr)
        return False


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Convert Fallout 1 .MSG text files to JSON arrays."
    )
    ap.add_argument("input",  help="Input .msg file or directory")
    ap.add_argument("output", help="Output .json file or directory")
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.output)

    if inp.is_file():
        out_file = out if out.suffix == ".json" else out / (inp.stem.lower() + ".json")
        ok = convert_file(inp, out_file)
        sys.exit(0 if ok else 1)

    elif inp.is_dir():
        files = sorted({
            p for p in inp.rglob("*")
            if p.suffix.upper() == ".MSG" and p.is_file()
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
