#!/usr/bin/env python3
import html
import re
import sys
from pathlib import Path


def get_godot_version_label(source: Path) -> str:
    header = (source / "core/version_generated.gen.h").read_text(encoding="utf-8")
    parts = dict(re.findall(r"^#define GODOT_VERSION_(MAJOR|MINOR|PATCH) (\d+)$", header, re.MULTILINE))
    status = re.search(r'^#define GODOT_VERSION_STATUS "([^"\n]+)"$', header, re.MULTILINE)
    if len(parts) != 3 or not status:
        sys.exit("Could not read version and status from the Godot build")
    version = f"{parts['MAJOR']}.{parts['MINOR']}"
    if parts["PATCH"] != "0":
        version += f".{parts['PATCH']}"
    return html.escape(f"Godot v{version} {status[1]}")


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
