#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
    printf 'Usage: %s path-to-godot-clone\n' "$0" >&2
    exit 2
fi
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
godot_src=$(CDPATH= cd -- "$1" && pwd -P)
if [ ! -f "$godot_src/SConstruct" ]; then
    printf 'Not a Godot source checkout: %s\n' "$godot_src" >&2
    exit 1
fi
for tool in scons emcc python3 git brotli gzip; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf 'Required build tool not found: %s\n' "$tool" >&2
        exit 1
    fi
done

commit=$(git -C "$godot_src" rev-parse HEAD)
stem=bin/godot.web.template_release.wasm32.nothreads.gdscript-only
scons -C "$godot_src" "profile=$repo/min_web_build.py" target=template_release \
    extra_suffix=gdscript-only "$stem.wrapped.js"

# SCons can leave an existing output untouched if it isn't a target of this build.
if ! grep -aFq "$commit" "$godot_src/$stem.wasm"; then
    printf 'The built WebAssembly does not contain Godot revision %s.\n' "$commit" >&2
    exit 1
fi

assets=$repo/docs/assets
mkdir -p "$assets"
cp "$godot_src/$stem.js" "$assets/godot.js"
brotli -q 9 -c "$godot_src/$stem.wasm" > "$assets/godot.wasm.br"
gzip -n -9 -c "$godot_src/$stem.wasm" > "$assets/godot.wasm.gz"
cp "$godot_src/LICENSE.txt" "$assets/godot.LICENSE.txt"
cp "$godot_src/COPYRIGHT.txt" "$assets/godot.COPYRIGHT.txt"
python3 "$repo/tools/update_godot_version.py" "$godot_src" "$repo/docs/index.html"
