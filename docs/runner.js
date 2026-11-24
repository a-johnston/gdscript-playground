/* Runs in an opaque-origin sandbox. No fetch, persistent FS, or page bridge. */
window.addEventListener('message', event => {
  if (event.source !== window.parent || window.parent === window || event.data?.type !== 'run' || event.ports.length !== 1) return;
  const { wasm, pack, source } = event.data;
  const port = event.ports[0];
  if (!(wasm instanceof ArrayBuffer) || !(pack instanceof ArrayBuffer) || typeof source !== 'string') return;
  run(port, wasm, pack, source);
});

let started = false;
async function run(port, wasm, pack, source) {
  if (started) return;
  started = true;
  let done = false;
  let skipBuildBanner = true;
  let remaining = 64 * 1024;
  let linesLeft = 2_000;
  const pending = [];
  let flushTimer;
  const send = data => port.postMessage(data);
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (pending.length) send({ type: 'output', lines: pending.splice(0) });
  }
  function log(stream, args) {
    if (done || remaining === 0 || linesLeft === 0) return;
    const message = args.join(' ');
    // The stock Web entry point prints this separately from --no-header.
    if (skipBuildBanner && stream === 'stdout' && message.startsWith('Build configuration: Emscripten ')) {
      skipBuildBanner = false;
      return;
    }
    pending.push({ stream, text: message.slice(0, remaining - 1) });
    remaining -= Math.min(remaining, message.length + 1);
    linesLeft -= 1;
    if (remaining === 0 || linesLeft === 0) pending.push({ stream: 'system', text: '[Output limit reached.]' });
    if (pending.length >= 64) flush();
    else if (flushTimer === undefined) flushTimer = setTimeout(flush, 30);
  }
  function finish(result) {
    if (done) return;
    done = true;
    flush();
    send(result);
  }
  function fail(error) {
    finish({ type: 'failed', message: String(error?.message ?? error) });
  }
  window.addEventListener('error', event => fail(event.error ?? event.message));
  window.addEventListener('unhandledrejection', event => fail(event.reason));

  try {
    // The text-only runtime doesn't render. A hidden iframe can have its
    // animation frames suspended, including the frame Godot uses to exit.
    // Keep the normal engine cleanup path, but schedule it on a timer.
    window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16);
    window.cancelAnimationFrame = id => clearTimeout(id);

    // Godot probes for a PWA registration on startup. Firefox exposes the API
    // in this opaque-origin frame but rejects getRegistration() asynchronously.
    // This runner has no service worker; report that locally without widening
    // the sandbox or suppressing unrelated exceptions.
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { getRegistration: async () => undefined },
      });
    }
    // These are the same Emscripten hooks Godot's Engine wrapper uses. Supplying
    // the bytes here lets the opaque-origin frame run with connect-src 'none'.
    const runtime = await Godot({
      noExitRuntime: false,
      thisProgram: 'godot',
      print: (...args) => log('stdout', args),
      printErr: (...args) => log('stderr', args),
      instantiateWasm(imports, ready) {
        WebAssembly.instantiate(wasm, imports).then(({ instance, module }) => ready(instance, module)).catch(fail);
        return {};
      },
    });
    await runtime.initFS([]);
    runtime.initConfig({
      canvas: document.getElementById('godot'), canvasResizePolicy: 0, focusCanvas: false,
      virtualKeyboard: false, locale: 'en', pid: 1, godotPoolSize: 1,
      onExit: code => finish({ type: 'exited', code }),
    });
    runtime.copyToFS('/runner.pck', pack);
    runtime.copyToFS('/tmp/snippet.txt', new TextEncoder().encode(source).buffer);
    runtime.callMain(['--main-pack', '/runner.pck', '--audio-driver', 'Dummy', '--no-header']);
  } catch (error) {
    fail(error);
  }
}
