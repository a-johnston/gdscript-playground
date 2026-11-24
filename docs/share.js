import { deflateSync, Inflate } from './assets/deflate.js';

export const MAX_DECODED_BYTES = 64 * 1024;
const encoder = new TextEncoder();

// These exact bytes are part of the unversioned share format. Do not change them.
const dictionary = encoder.encode([
  'if ', 'else:', 'elif ', 'for ', 'return', 'while ', 'await ', 'continue', 'static ',
  'break', 'class_name ', 'enum ', 'class ', 'pass', 'func ', 'match ', ' in ', 'var ',
  '.new()', '.append(', 'range(', 'print', 'len', 'lerp',
  ' -> ', ' := ', '\n\n',  ' = ', ', ', '    ',
  ' == ', ' != ', ' and ', ' or ', 'not ',
  'true', 'false', 'null',
  'int', 'float', 'bool', 'Vector', 'Array', 'String', 'Dictionary',
  'extends Node', 'func _ready()',
  'extends Node\n\nfunc _ready() -> void:',
].join('\n'));

export function encodeSnippet(source) {
  const bytes = encoder.encode(source);
  // Don't generate a link that the decoder would refuse to open.
  if (bytes.length > MAX_DECODED_BYTES) throw new Error('The snippet is too large to share (64 KiB decoded limit).');
  const packed = deflateSync(bytes, { dictionary, level: 6 });
  let binary = '';
  for (const byte of packed) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeSnippet(payload) {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('Invalid snippet link.');
  const packed = Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let length = 0;
  let source = '';
  const inflater = new Inflate({ dictionary }, (chunk, final) => {
    length += chunk.byteLength;
    if (length > MAX_DECODED_BYTES) throw new Error('The decoded snippet is larger than 64 KiB.');
    source += decoder.decode(chunk, { stream: !final });
  });
  // Limit expansion per push so the decoder can abort before inflating the whole payload.
  const step = 256;
  for (let offset = 0; offset < packed.length; offset += step) {
    const end = offset + step;
    inflater.push(packed.subarray(offset, end), end >= packed.length);
  }
  return source;
}
