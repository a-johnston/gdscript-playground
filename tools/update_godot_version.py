#!/usr/bin/env python3
import html
import re
import subprocess
import sys
from pathlib import Path


def get_godot_version_label(source: Path) -> str:
    header = (source / "core/version_generated.gen.h").read_text(encoding="utf-8")
    hash_source = (source / "core/version_hash.gen.cpp").read_text(encoding="utf-8")
    parts = dict(re.findall(r"^#define GODOT_VERSION_(MAJOR|MINOR|PATCH) (\d+)$", header, re.MULTILINE))
    status = re.search(r'^#define GODOT_VERSION_STATUS "([^"\n]+)"$', header, re.MULTILINE)
    commit = re.search(r'\bGODOT_VERSION_HASH\s*=\s*"([0-9a-f]{9,})"', hash_source)
    if len(parts) != 3 or not status or not commit:
        sys.exit("Could not read version, status, and Git revision from the Godot build")
    version = f"{parts['MAJOR']}.{parts['MINOR']}"
    if parts["PATCH"] != "0":
        version += f".{parts['PATCH']}"
    short = subprocess.check_output(["git", "-C", str(source), "rev-parse", "--short", commit[1]], text=True)
    return html.escape(f"Godot Engine v{version} {status[1]} ({short.strip()})")


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: update_godot_version.py source index")
        sys.exit(len(set(sys.argv) & {"-h", "--help"}) == 0)
    source, index = map(Path, sys.argv[1:])
    label = get_godot_version_label(source)
    index_str = index.read_text(encoding="utf-8")
    updated, count = re.subn(r'(?<=<span id="godot-version">)[^<]*(?=</span>)', label, index_str)
    if count != 1:
        sys.exit(f"Expected one Godot version label in {index}, found {count}")
    index.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    main()
