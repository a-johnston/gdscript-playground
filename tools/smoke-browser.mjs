import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright-core';
import { encodeSnippet } from '../docs/share.js';

const root = resolve('docs');
const requests = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  requests.push(pathname);
  const path = resolve(root, pathname.slice('/playground/'.length) || 'index.html');
  if (!pathname.startsWith('/playground/') || !path.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(path);
    response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/playground/`;
const pasteText = (editor, text) => editor.evaluate((el, input) => {
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', input);
  el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
}, text);
const browserName = process.env.BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported BROWSER: ${browserName}`);
let browser, page;
try {
  browser = await browserType.launch({
    executablePath: browserName === 'chromium' ? process.env.CHROMIUM_PATH : undefined,
    timeout: 15_000,
  });
  page = await browser.newPage({ colorScheme: 'dark' });
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => console.error('Browser error:', error));
  page.on('console', message => {
    if (message.text().startsWith('[runner diagnostic]')) console.error(message.text());
  });
  const stubClipboard = browserName !== 'chromium';
  if (!stubClipboard) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  }
  await page.addInitScript(stubClipboard => {
    if (stubClipboard && window === window.top) {
      let clipboard = '';
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async text => { clipboard = text; }, readText: async () => clipboard },
      });
    }
    window.addEventListener('unhandledrejection', ({ reason }) => {
      console.error('[runner diagnostic]', reason?.stack ?? String(reason));
    });
    if (location.pathname.endsWith('/runner.html')) {
      // Simulate a browser suspending animation frames in the hidden runner.
      window.requestAnimationFrame = () => 0;
      // Reproduce Firefox's asynchronous rejection in other browsers, too.
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { getRegistration: async () => { throw new DOMException('The operation is insecure.', 'SecurityError'); } },
      });
    }
  }, stubClipboard);
  const navigations = [];
  page.on('request', request => navigations.push(request.url()));
  await page.goto(url);
  const sourceMark = page.getByRole('link', { name: 'Source on GitHub' }).locator('svg');
  assert.deepEqual(await sourceMark.evaluate(el => {
    const { width, height } = el.getBoundingClientRect();
    return [width, height];
  }), [16, 16], 'GitHub link renders a 16px square icon');
  const versionLabel = page.locator('#godot-version');
  assert.match(await versionLabel.textContent(), /^Godot Engine v\d+\.\d+(?:\.\d+)? .+ \([0-9a-f]{4,}\)$/);
  assert.ok(await sourceMark.evaluate(el => {
    const icon = el.getBoundingClientRect();
    const row = el.closest('.footer-top');
    const header = document.querySelector('.masthead').getBoundingClientRect();
    const shortcut = row.querySelector('#shortcut').getBoundingClientRect();
    const version = row.querySelector('#godot-version').getBoundingClientRect();
    return icon.right === header.right && shortcut.left === header.left &&
      version.right <= icon.left && version.top < icon.bottom && version.bottom > icon.top &&
      shortcut.top < icon.bottom && shortcut.bottom > icon.top;
  }), 'Footer content aligns with the inset header on both sides');
  assert.ok(await sourceMark.evaluate(el =>
    getComputedStyle(el.querySelector('path')).fill === getComputedStyle(document.body).color
  ), 'GitHub icon uses the text color');
  await page.locator('link[rel="icon"]').evaluate(async el => {
    const image = new Image();
    image.src = el.href;
    await image.decode();
  });
  const source = page.getByRole('textbox', { name: 'GDScript source' });
  const run = page.getByRole('button', { name: 'Run', exact: true });
  const runReady = page.locator('#run:enabled');
  const copyOutput = page.locator('#copy-output');
  const output = page.locator('#output');
  await source.waitFor();
  const sourceLines = source.locator('.cm-line');
  assert.equal(await sourceLines.nth(3).textContent(), '    print("Hello, world!")');
  const firstNumber = page.locator('#editor .cm-lineNumbers .cm-gutterElement:visible').filter({ hasText: /^1$/ });
  assert.ok(await firstNumber.evaluate(el => {
    const digit = document.createRange();
    digit.selectNodeContents(el);
    const header = document.querySelector('.masthead').getBoundingClientRect();
    return Math.abs(digit.getBoundingClientRect().left - header.left) < 2;
  }), 'Header and footer line up with the first gutter digit');
  const keyword = source.getByText('extends', { exact: true });
  const keywordColor = () => keyword.evaluate(el => getComputedStyle(el).color);
  const pageColor = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  const checkLineAlignment = () => page.waitForFunction(() => {
    const lines = [...document.querySelectorAll('#editor .cm-line')];
    const numbers = [...document.querySelectorAll('#editor .cm-lineNumbers .cm-gutterElement')]
      .filter(el => getComputedStyle(el).visibility !== 'hidden');
    // Include the blank second line, and allow for subpixel rounding.
    return lines.length >= 4 && numbers.length === lines.length && lines.every((line, i) =>
      Math.abs(line.getBoundingClientRect().top - numbers[i].getBoundingClientRect().top) < 1);
  });
  await checkLineAlignment();
  const darkColor = await pageColor();
  const darkKeyword = await keywordColor();
  // drawSelection supplies its own cursor and hides the native caret.
  await source.focus();
  const cursor = page.locator('#editor .cm-cursor-primary');
  await cursor.waitFor();
  const darkCursor = await cursor.evaluate(el => getComputedStyle(el).borderLeftColor);
  const selection = page.locator('#editor .cm-selectionBackground');
  const checkSelection = async () => {
    await source.press('Shift+ArrowRight');
    const [unselected, selected] = await selection.evaluate(el => {
      const editor = el.closest('.cm-editor');
      const line = editor.querySelector('.cm-activeLine');
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      // Match CodeMirror's paint order: surface, selection, then line tint.
      ctx.fillStyle = getComputedStyle(editor.closest('.panel')).backgroundColor;
      ctx.fillRect(0, 0, 2, 1);
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(1, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(line).backgroundColor;
      ctx.fillRect(0, 0, 2, 1);
      const pixels = ctx.getImageData(0, 0, 2, 1).data;
      return [Array.from(pixels.slice(0, 4)), Array.from(pixels.slice(4))];
    });
    assert.notDeepEqual(selected, unselected, 'the active line does not hide selected text');
    await source.press('ArrowLeft');
    await selection.waitFor({ state: 'hidden' });
    return selected;
  };
  const darkSelection = await checkSelection();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(before => {
    const cursor = document.querySelector('#editor .cm-cursor-primary');
    return cursor && getComputedStyle(cursor).borderLeftColor !== before;
  }, darkCursor);
  assert.notEqual(await pageColor(), darkColor, 'page follows a system theme change');
  assert.notEqual(await keywordColor(), darkKeyword, 'tokens follow a system theme change');
  assert.notDeepEqual(await checkSelection(), darkSelection, 'selection follows a system theme change');
  await checkLineAlignment();
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'appearance does not use local storage');
  assert.equal(await copyOutput.isDisabled(), true);
  assert.equal(requests.some(path => /runner|godot/.test(path)), false, 'no engine requests before Run');

  // Hold the pack fetch until the sandbox has been checked. One-shot runs
  // otherwise exit before there is time to inspect the iframe.
  let releasePack;
  const packGate = new Promise(resolve => { releasePack = resolve; });
  await page.route('**/assets/runner.pck', async route => {
    await packGate;
    await route.continue();
  });
  const navigated = page.waitForEvent('framenavigated', frame => frame.url().endsWith('/runner.html'));
  await run.click();
  try {
    const frame = await navigated;
    await frame.waitForLoadState();
    assert.equal(await frame.evaluate(() => origin), 'null');
    const networkBlocked = await frame.evaluate(async here => {
      try { await fetch(here); return false; } catch { return true; }
    }, url);
    assert.equal(networkBlocked, true);
  } finally {
    releasePack();
  }
  await page.getByText('Hello, world!', { exact: true }).waitFor();
  await runReady.waitFor();
  assert.equal(await output.textContent(), 'Hello, world!\n', 'no engine banners or run-status messages');
  assert.equal(await page.locator('iframe').count(), 0, 'runner exits automatically');
  await copyOutput.click();
  await copyOutput.getByText('Copied', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Hello, world!\n');
  assert.equal(requests.filter(path => path.includes('godot.wasm.')).length, 1);

  await source.fill('func _ready():');
  await source.press('Enter');
  assert.equal(await sourceLines.nth(1).textContent(), '    ', 'auto-indent inserts four spaces');
  await source.press('Tab');
  assert.equal(await sourceLines.nth(1).textContent(), '        ', 'Tab inserts four spaces');
  await source.press('ControlOrMeta+a');
  await pasteText(source, 'func _ready():\n  \tif true:\n\t\tprint("Keep\tthis")\n    pass');
  assert.deepEqual(await sourceLines.allTextContents(), [
    'func _ready():', '    if true:', '        print("Keep\tthis")', '    pass',
  ], 'paste expands indentation to four-column tab stops and preserves inline tabs');

  await source.fill('extends Node\nfunc _ready():\n\tprint("Ready once")\n\tawait get_tree().process_frame\n\tprint("Should not resume")\nfunc _process(_delta):\n\tprint("Should not process")');
  await source.press('ControlOrMeta+Enter');
  await page.getByText('Ready once', { exact: true }).waitFor();
  await runReady.waitFor();
  assert.equal(await output.textContent(), 'Ready once\n');

  await source.fill('extends Node\nfunc _ready(:\n\tpass');
  await run.click();
  const diagnostic = page.getByRole('button', { name: /^Line 2: Parse Error:/ });
  await diagnostic.click();
  assert.equal(await source.evaluate(el => document.activeElement === el), true);
  assert.equal(await page.locator('.cm-editor').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  await runReady.waitFor();
  assert.equal(requests.filter(path => path.includes('godot.wasm.')).length, 1, 'WASM reused on rerun');

  const snippet = 'extends Node\nfunc _ready():\n\tprint("Shared 🐸 <b>text</b>")\n\tget_tree().quit()';
  await source.fill(snippet);
  await page.evaluate(() => {
    window.showSaveFilePicker = async ({ suggestedName }) => ({
      createWritable: async () => ({
        write: async text => { window.savedSnippet = { suggestedName, text }; },
        close: async () => { window.savedSnippet.closed = true; },
      }),
    });
  });
  await source.press('ControlOrMeta+s');
  await page.waitForFunction(() => window.savedSnippet?.closed);
  assert.deepEqual(await page.evaluate(() => window.savedSnippet), {
    suggestedName: 'snippet.gd', text: snippet, closed: true,
  }, 'Save requests a GDScript filename and writes the exact snippet');

  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const [download] = await Promise.all([page.waitForEvent('download'), source.press('ControlOrMeta+s')]);
  assert.equal(download.suggestedFilename(), 'snippet.gd');
  assert.equal(await readFile(await download.path(), 'utf8'), snippet, 'download fallback preserves the source');
  assert.equal(page.url(), url, 'Save leaves the playground open');

  const copyLink = page.locator('#copy-link');
  const historyLength = await page.evaluate(() => history.length);
  await copyLink.click();
  await copyLink.getByText('Copied', { exact: true }).waitFor();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(link, `${url}#${encodeSnippet(snippet)}`);
  assert.equal(page.url(), link);
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal(await page.locator('#notice').isHidden(), true);
  const fallback = await browser.newPage();
  fallback.on('pageerror', error => console.error('Browser error:', error));
  await fallback.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
    const NativeStream = window.DecompressionStream;
    window.DecompressionStream = class extends NativeStream {
      constructor(format) {
        if (format === 'brotli') throw new TypeError('Testing gzip-only browsers');
        super(format);
      }
    };
  });
  await fallback.goto(link);
  await fallback.getByText('print("Shared 🐸 <b>text</b>")', { exact: true }).waitFor();
  assert.equal(await fallback.locator('iframe').count(), 0, 'shared links do not auto-run');
  await fallback.getByRole('button', { name: 'Run', exact: true }).click();
  await fallback.getByText('Shared 🐸 <b>text</b>', { exact: true }).waitFor();
  await fallback.locator('#run:enabled').waitFor();
  assert.equal(await fallback.locator('#output b').count(), 0, 'output is rendered as text');
  assert.equal(requests.includes('/playground/assets/godot.wasm.gz'), true);

  const fallbackSource = fallback.getByRole('textbox', { name: 'GDScript source' });
  const fallbackNotice = fallback.locator('#notice');
  const fallbackCopy = fallback.locator('#copy-link');
  const edited = snippet.replace('Shared', 'Edited');
  await fallbackSource.fill(edited);
  const fallbackHistory = await fallback.evaluate(() => history.length);
  await fallbackCopy.click();
  await fallbackNotice.getByText('Could not copy to the clipboard. Copy the share link from the address bar.', { exact: true }).waitFor();
  const editedLink = `${url}#${encodeSnippet(edited)}`;
  assert.equal(fallback.url(), editedLink);
  assert.equal(await fallback.evaluate(() => history.length), fallbackHistory);

  const largeSnippet = `${('#' + ' padding'.repeat(33) + '\n').repeat(260)}extends Node\nfunc _ready():\n\tprint("Large pasted script")`;
  await fallbackSource.press('ControlOrMeta+a');
  await pasteText(fallbackSource, largeSnippet);
  await fallbackCopy.click();
  await fallbackNotice.getByText('The snippet is too large to share (64 KiB decoded limit).', { exact: true }).waitFor();
  assert.equal(fallback.url(), editedLink, 'encoding failure leaves URL unchanged');
  await fallback.getByRole('button', { name: 'Run', exact: true }).click();
  await fallback.locator('#output').getByText('Large pasted script', { exact: true }).waitFor();
  await fallback.locator('#run:enabled').waitFor();

  await fallback.evaluate(() => { location.hash = '%%%'; });
  await fallbackNotice.getByText('Invalid snippet link.', { exact: true }).waitFor();
  await fallbackSource.getByText('"Large pasted script"', { exact: true }).waitFor();

  // A runner that starts but never sends an exit message must not leave Run disabled.
  await page.route('**/runner.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.onmessage = ({ ports: [port] }) => {
      port.postMessage({ type: 'running' });
      port.postMessage({ type: 'output', lines: [{ stream: 'stdout', text: 'Started without exit' }] });
    };`,
  }));
  await page.clock.install();
  await run.click();
  await page.getByText('Started without exit', { exact: true }).waitFor();
  assert.equal(await run.isDisabled(), true);
  await page.clock.fastForward(45_000);
  await page.getByText('Godot did not finish in time.', { exact: true }).waitFor();
  await runReady.waitFor();
  assert.equal(await page.locator('iframe').count(), 0, 'unresponsive runner is discarded');

  assert.ok(navigations.every(request => request.startsWith(url)), 'no third-party requests');
  console.log(`${browserName} smoke passed: system appearance, aligned line numbers, one-shot _ready, reruns, clipboard, diagnostics, WASM gzip fallback, and iframe isolation.`);
} catch (error) {
  if (page) console.error('Last run:', await page.locator('#output').textContent());
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
