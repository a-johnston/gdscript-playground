import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { decodeSnippet, encodeSnippet, MAX_DECODED_BYTES } from '../docs/share.js';

const fragment = bytes => Buffer.from(bytes).toString('base64url');
const starter = 'extends Node\n\nfunc _ready() -> void:\n    print("Hello, world!")\n';

test('a single raw DEFLATE format preserves source, including Unicode and whitespace', () => {
  const script = '\ufeffextends Node\r\n\r\nfunc _ready():\r\n\tprint("🐸 café    ")\r\n';
  const link = encodeSnippet(script);
  assert.match(link, /^[A-Za-z0-9_-]+$/);
  assert.equal(decodeSnippet(link), script);
  assert.equal(decodeSnippet(encodeSnippet('')), '');
});

test('the shared dictionary shortens the starter without appearing in the link', () => {
  const link = encodeSnippet(starter);
  const packed = Buffer.from(link, 'base64url');
  assert.ok(packed.length < deflateRawSync(starter).length);
  assert.throws(() => inflateRawSync(packed)); // Back-references need the app dictionary.
  assert.equal(decodeSnippet(link), starter);
});

test('a fixed share payload depends on the exact dictionary bytes', () => {
  const legacyStarter = starter.replace('    ', '\t');
  assert.equal(decodeSnippet('I0YNFyfYkxpKHqk5Ofk6CuX5RTkpikqaXAA'), legacyStarter);
});

test('streaming inflate round-trips Unicode across compressed input chunks', () => {
  const source = Array.from({ length: 400 }, (_, i) => `# ${Math.imul(i, 2654435761)} 🐸 café\n`).join('');
  const link = encodeSnippet(source);
  assert.ok(Buffer.from(link, 'base64url').length > 256);
  assert.equal(decodeSnippet(link), source);
});

test('malformed payloads and non-UTF-8 source are rejected', () => {
  assert.throws(() => decodeSnippet(''), /Invalid snippet link/);
  assert.throws(() => decodeSnippet('%%%'), /Invalid snippet link/);
  assert.throws(() => decodeSnippet('AAAA'));
  assert.throws(() => decodeSnippet(fragment(deflateRawSync(Buffer.of(255)))));
  const packed = Buffer.from(encodeSnippet('extends Node\n'), 'base64url');
  assert.throws(() => decodeSnippet(fragment(packed.subarray(0, -1))));
});

test('the expanded-size cap rejects a zip bomb and prevents generating unreadable links', () => {
  const source = 'é'.repeat(MAX_DECODED_BYTES / 2);
  assert.equal(decodeSnippet(encodeSnippet(source)), source);
  assert.throws(() => encodeSnippet(source + 'a'), /64 KiB/);
  const bomb = fragment(deflateRawSync(Buffer.alloc(MAX_DECODED_BYTES * 16, 97)));
  assert.throws(() => decodeSnippet(bomb), /The decoded snippet is larger than 64 KiB/);
});

test('there is no independent fragment length cap', () => {
  const source = randomBytes(36 * 1024).toString('base64url');
  const link = encodeSnippet(source);
  assert.ok(link.length > 32_768);
  assert.equal(decodeSnippet(link), source);
});
