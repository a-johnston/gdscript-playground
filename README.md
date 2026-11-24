# GDScript Playground

A static playground for one Godot 4.8 GDScript snippet. No account, backend, CDN, or build step is needed to serve the site. CodeMirror, the compression codec, and the engine are vendored; see [third-party notices](THIRD_PARTY.md). Godot downloads on the first **Run**. **Copy link** puts the shareable URL in the address bar without adding a history entry and tries to copy it to your clipboard. Opening the link never runs the code.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Open <http://127.0.0.1:8000/>. For GitHub Pages, publish the branch’s **`/docs`** folder under **Settings → Pages**. URLs are relative, so a project site under `/repo-name/` works. Use a current browser with WebAssembly and the Compression Streams API.

Everything after `#` in a share link is a base64url raw DEFLATE payload. The vendored fflate codec uses a fixed GDScript dictionary in `docs/share.js`; its exact bytes are part of the format and must not change. Source bytes are never normalized. The decoder limits expanded source to 64 KiB, and **Copy link** won't generate a link that exceeds that limit. There is no app-imposed URL length limit, and the sharing limit does not apply to **Run**. If clipboard access is unavailable, copy the link from the address bar.

The editor indents with four spaces and expands leading tabs on paste. Tabs within a line and whitespace in existing share links are left intact. Press **Ctrl+S** (**⌘S** on Mac) to save the current source as `snippet.gd`. Browsers without a file picker use their normal download behavior.

The page and syntax highlighting follow your browser’s light or dark preference. No appearance settings are stored.

## What runs

Write `extends Node` and use `_ready()` as the entry point. The runner adds the snippet as a real child in a `SceneTree`, lets `_ready()` run once, then frees the node and quits. It does not keep the scene alive for `_process()`, timers, or an `await` that resumes in a later frame. `print()` and script errors appear in the output panel; click a diagnostic to jump to its line or use **Copy output** to copy the log. Graphics, 2D/3D nodes, audio, project assets, and most optional Godot modules are not supported.

The isolated runner gets a fresh opaque-origin iframe, an in-memory filesystem, and a CSP that disallows runtime network requests. The editor sends engine bytes, the trusted runner pack, and source through a one-run message channel. The JavaScript bridge is disabled in the engine. This is a prototype, not a hardened multi-tenant sandbox: the stock Godot Web runtime needs a DOM canvas, and the iframe can share a browser thread with the editor. **A synchronous infinite loop can freeze the tab; close or reload the tab if it hangs.** This can happen on localhost too. Do not run untrusted snippets just because you can open their links safely.

## Refresh vendored assets

- **Editor and share codec:** `npm ci && npm run build:assets`. `src/gdscript.js` is a lightweight CodeMirror 6 tokenizer and indenter, not a parser. Godot validates the actual script. `src/deflate.js` selects the two fflate exports the share codec needs; the build bundles their implementation into `docs/assets/deflate.js`. Both bundles are served directly, with no npm or CDN needed at runtime. The build also generates their license notices in `docs/assets/`.
- **Engine:** The vendored release build is Godot **4.8 beta at `25d0522345`**, built with Emscripten **7.0.1-git** and no engine patches. With SCons, Emscripten, and `brotli` on your `PATH`, rebuild and vendor it from a local Godot clone:

  ```sh
  sh tools/vendor_godot.sh /path/to/godot
  ```

  The script builds the single-threaded Web release template with `min_web_build.py`, overwrites the vendored engine files, and updates the footer from the build’s generated version and Git revision. Commit or stash local edits before running it so you can restore the affected files from Git if an update fails. The app uses the generated Emscripten factory rather than the `Engine` wrapper so an opaque-origin frame can instantiate WASM without fetching it. Keep `godot.js`, the two compressed WASM files, and the vendor notices in sync. The site serves **2.68 MiB Brotli WASM** where supported, or **3.43 MiB gzip WASM** elsewhere. These are precompressed files, decoded by the app, so this does not depend on Pages providing a particular `Content-Encoding`. Only one variant is fetched.
- **Runner pack:** The source is in `runner/`. Use a Godot 4.8 editor binary to repack it after editing:

  ```sh
  godot --headless --script "$PWD/tools/pack_runner.gd" -- \
    "$PWD/runner" "$PWD/docs/assets/runner.pck"
  ```

## Verification

```sh
npm test
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

The smoke test serves the app from a project subpath and checks system appearance, editor line alignment, lazy loading, one-shot `_ready()` execution, diagnostic navigation, copying output and share links, the WASM gzip fallback, and iframe isolation. If using Playwright’s Chromium instead of a system browser, install it with `npx playwright-core install chromium` and omit `CHROMIUM_PATH`. The same test supports `BROWSER=firefox` and `BROWSER=webkit` with the corresponding Playwright browser installed.

## License

The project is licensed under the [Apache License, Version 2.0](LICENSE). Vendored components retain their own licenses; see [third-party notices](THIRD_PARTY.md).
