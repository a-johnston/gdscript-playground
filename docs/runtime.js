const COMPLETION_LIMIT_MS = 45_000;
let assetsPromise;

async function fetchAsset(name) {
  const response = await fetch(new URL(`./assets/${name}`, import.meta.url), { credentials: 'omit' });
  if (!response.ok || !response.body) throw new Error(`Could not load ${name} (${response.status}).`);
  return response;
}

async function loadWasm() {
  let compression, extension;
  try {
    compression = new DecompressionStream('brotli');
    extension = 'br';
  } catch {
    compression = new DecompressionStream('gzip');
    extension = 'gz';
  }
  const response = await fetchAsset(`godot.wasm.${extension}`);
  return new Response(response.body.pipeThrough(compression)).arrayBuffer();
}

function getAssets() {
  assetsPromise ??= Promise.all([loadWasm(), fetchAsset('runner.pck').then(response => response.arrayBuffer())]).catch(error => {
    assetsPromise = undefined;
    throw error;
  });
  return assetsPromise;
}

// Each run gets an empty Godot instance and an opaque-origin frame. This is
// browser-capability isolation, not a guarantee of CPU/thread isolation.
export function launchSnippet(source, receive) {
  const frame = document.createElement('iframe');
  frame.className = 'runner-frame';
  frame.title = 'Godot snippet runner';
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.src = new URL('./runner.html', import.meta.url);
  const channel = new MessageChannel();
  let active = true;
  let sent = false;
  // Keep the watchdog armed until the runner actually exits. This recovers
  // from a missing exit message, but cannot fire while the tab is frozen.
  const completionTimer = setTimeout(() => finish({ type: 'failed', message: 'Godot did not finish in time.' }), COMPLETION_LIMIT_MS);

  function finish(event) {
    if (!active) return;
    active = false;
    clearTimeout(completionTimer);
    channel.port1.close();
    if (!sent) channel.port2.close();
    frame.remove();
    receive(event);
  }

  channel.port1.onmessage = ({ data }) => {
    if (!active) return;
    if (data.type === 'output') {
      receive(data);
    } else if (data.type === 'exited' || data.type === 'failed') {
      finish(data);
    }
  };

  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  document.body.append(frame);
  Promise.all([loaded, getAssets()]).then(([, [wasm, pack]]) => {
    if (!active) return;
    const wasmCopy = wasm.slice(0);
    const packCopy = pack.slice(0);
    // The frame has an opaque origin, so '*' is required. Results come back
    // only on this run's private port, not through a global message listener.
    frame.contentWindow.postMessage({ type: 'run', source, wasm: wasmCopy, pack: packCopy }, '*', [wasmCopy, packCopy, channel.port2]);
    sent = true;
  }).catch(error => finish({ type: 'failed', message: error.message }));
}
