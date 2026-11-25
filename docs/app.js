import { mountEditor } from './assets/editor.js';
import { launchSnippet } from './runtime.js';
import { decodeSnippet, encodeSnippet } from './share.js';

const example = `extends Node

func _ready() -> void:
    print("Hello, world!")
`;

const $ = id => document.getElementById(id);
const runButton = $('run');
const output = $('output');
const diagnosticsPanel = $('diagnostics');
const copyOutputButton = $('copy-output');
let revision = 0;
let savePending = false;

const editor = mountEditor({
  parent: $('editor'), source: example, onRun: run,
  onEdit() {
    revision += 1;
    if (!diagnosticsPanel.hidden) queueMicrotask(clearDiagnostics);
  },
});

if (/mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.userAgent)) $('shortcut').textContent = '⌘';

function setNotice(message = '') {
  const notice = $('notice');
  notice.textContent = message;
  notice.hidden = !message;
}

function clearDiagnostics() {
  editor.setDiagnostics([]);
  diagnosticsPanel.replaceChildren();
  diagnosticsPanel.hidden = true;
}

function showDiagnostics(items) {
  editor.setDiagnostics(items);
  diagnosticsPanel.replaceChildren(...items.map(({ line, message }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Line ${line}: ${message}`;
    button.addEventListener('click', () => editor.jumpToLine(line));
    return button;
  }));
  diagnosticsPanel.hidden = items.length === 0;
}

function appendOutput(lines) {
  const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 12;
  const fragment = document.createDocumentFragment();
  for (const { stream, text } of lines) {
    const line = document.createElement('span');
    line.className = stream;
    line.textContent = `${text}\n`;
    fragment.append(line);
  }
  output.append(fragment);
  if (lines.length) copyOutputButton.disabled = false;
  if (atBottom) output.scrollTop = output.scrollHeight;
}

function run() {
  if (runButton.disabled) return;
  const source = editor.source;
  const runRevision = revision;
  const diagnostics = [];
  let lastError = '';
  setNotice();
  clearDiagnostics();
  output.replaceChildren();
  runButton.disabled = true;
  copyOutputButton.disabled = true;
  launchSnippet(source, event => {
    if (event.type === 'output') {
      appendOutput(event.lines);
      if (runRevision !== revision || diagnostics.length >= 30) return;
      let changed = false;
      for (const { stream, text } of event.lines) {
        if (stream !== 'stderr') continue;
        const error = text.match(/^(?:SCRIPT ERROR|ERROR):\s*(.+)/m);
        if (error) lastError = error[1];
        const location = text.match(/\(res:\/\/snippet\.gd:(\d+)\)/);
        if (!location || !lastError) continue;
        const line = Number(location[1]);
        if (!diagnostics.some(item => item.line === line && item.message === lastError)) {
          diagnostics.push({ line, message: lastError });
          changed = true;
        }
      }
      if (changed) showDiagnostics(diagnostics);
      return;
    }
    runButton.disabled = false;
    if (event.type === 'failed') {
      appendOutput([{ stream: 'stderr', text: event.message }]);
    } else if (event.code && !output.querySelector('.stderr')) {
      appendOutput([{ stream: 'stderr', text: `Godot exited with code ${event.code}.` }]);
    }
  });
}

async function saveSnippet() {
  if (savePending) return;
  savePending = true;
  setNotice();
  const source = editor.source;
  const filename = 'snippet.gd';
  try {
    let file;
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        file = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'GDScript', accept: { 'text/plain': ['.gd'] } }],
        });
      } catch (error) {
        // An unavailable or restricted picker can fall back to a download; cancel cannot.
        if (error.name !== 'SecurityError' && error.name !== 'NotSupportedError') throw error;
      }
    }
    if (file) {
      const writable = await file.createWritable();
      await writable.write(source);
      await writable.close();
    } else {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    if (error.name !== 'AbortError') setNotice('Could not save the snippet.');
  } finally {
    savePending = false;
  }
}

function loadSharedSnippet() {
  try {
    editor.source = location.hash ? decodeSnippet(location.hash.slice(1)) : example;
    setNotice();
  } catch (error) {
    setNotice(error.message);
  }
}

function wireCopyButton(button, getText, onClipboardError) {
  const label = button.textContent;
  const caption = document.createElement('span');
  caption.textContent = label;
  button.dataset.copyLabel = label;
  button.replaceChildren(caption);
  let feedback;
  button.addEventListener('click', async () => {
    clearTimeout(feedback);
    caption.textContent = label;
    setNotice();
    let text;
    try {
      text = getText();
    } catch (error) {
      setNotice(error.message);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (onClipboardError) setNotice(onClipboardError);
      return;
    }
    caption.textContent = 'Copied';
    feedback = setTimeout(() => { caption.textContent = label; }, 1_500);
  });
}

runButton.addEventListener('click', run);
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey ||
      event.isComposing || event.key.toLowerCase() !== 's') return;
  event.preventDefault();
  if (!event.repeat) void saveSnippet();
});
window.addEventListener('hashchange', loadSharedSnippet);
if (location.hash) loadSharedSnippet();
wireCopyButton($('copy-code'), () => editor.source);
wireCopyButton($('copy-link'), () => {
  const url = new URL(location.href);
  url.hash = encodeSnippet(editor.source);
  history.replaceState(history.state, '', url);
  return url.href;
}, 'Could not copy to the clipboard. Copy the share link from the address bar.');
wireCopyButton(copyOutputButton, () => output.textContent,
  'Could not copy. Use HTTPS or localhost and check your clipboard permissions.');
