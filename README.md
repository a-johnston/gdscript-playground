# GDScript Playground

A static Godot 4.8 GDScript shareable snippet runner. Runs entirely in-browser against a minimal godot web build without local or server-side storage. Shared snippets use DEFLATE with a small custom gdscript dictionary to produce compact links which entirely encode the shared script. Scripts are expected to inherit from some `Node` type and use `_ready` as the snippet entrypoint.

One way to run locally:
```sh
python3 -m http.server --directory docs
```

For GitHub Pages, publish the branch's `/docs` folder under Settings -> Pages.

Shared snippets have a 64k size limit to prevent zip-bombs. Infinite loops will hang the tab and require the tab to be closed and reopened. The codemirror editor uses spaces and expands leading tab characters. Ctrl/Cmd + S saves the current snippet as a gdscript file, Ctrl/Cmd + Enter runs the current snippet.

## Refresh vendored assets

Requires `npm`, `scons`, `emscripten`, `python3`, `git`, `brotli`, and `gzip`:

```sh
npm ci && npm run build:assets
tools/vendor_godot.sh /path/to/godot
```

This triggers a build of godot using the options in `min_web_build.py` and a custom suffix to avoid clobbering normal godot builds. The runner pck needs to be repacked with a Godot 4.8 binary if its source is modified:

```sh
godot --headless --script tools/pack_runner.gd -- runner docs/assets/runner.pck
```

## License

The project is licensed under [Apache 2.0](LICENSE). Vendored components retain their own licenses:

- Godot Engine - [MIT License](docs/assets/godot.LICENSE.txt) and [third-party copyright notices](docs/assets/godot.COPYRIGHT.txt)
- CodeMirror 6 and dependencies - [MIT Licenses and copyright notices](docs/assets/editor.LICENSES.txt).
- fflate - [MIT License](docs/assets/deflate.LICENSES.txt).
