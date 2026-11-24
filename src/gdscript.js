import { StreamLanguage } from '@codemirror/language';

const keywords = new Set(`abstract and as assert await break breakpoint class class_name const
continue elif else enum extends for func if in is match not or pass preload return signal static
super var void when while`.split(/\s+/));
const atoms = new Set(['false', 'true', 'null', 'self', 'PI', 'TAU', 'INF', 'NAN']);
const builtinTypes = new Set(`bool int float String StringName NodePath Variant Array Dictionary
Callable Signal Object RefCounted Node SceneTree Vector2 Vector2i Vector3 Vector3i Vector4
Vector4i Rect2 Rect2i Transform2D Transform3D Basis Quaternion Plane Projection AABB Color
PackedByteArray PackedInt32Array PackedInt64Array PackedFloat32Array PackedFloat64Array
PackedStringArray PackedVector2Array PackedVector3Array PackedVector4Array PackedColorArray`.split(/\s+/));
const identifier = /^[\p{ID_Start}_]\p{ID_Continue}*/u;
const number = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/;
const closing = { '(': ')', '[': ']', '{': '}' };

function readString(stream, state) {
  const { end, raw } = state.string;
  while (!stream.eol()) {
    if (stream.match(end)) {
      state.string = null;
      break;
    }
    if (stream.next() === '\\' && !raw) stream.next();
  }
  if (end.length === 1 && stream.eol()) state.string = null;
  return 'string';
}

// Highlighting and indentation only. Godot, not this tokenizer, validates the source.
export const gdscript = StreamLanguage.define({
  name: 'GDScript',
  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
  },
  startState: () => ({ string: null, brackets: [], indent: 0, block: false }),
  copyState: state => ({ ...state, brackets: state.brackets.slice() }),
  token(stream, state) {
    if (stream.sol()) {
      state.indent = stream.indentation();
      state.block = false;
    }
    if (state.string) return readString(stream, state);
    if (stream.eatSpace()) return null;
    if (stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^@[\p{ID_Start}_]\p{ID_Continue}*/u)) return 'meta';
    const literal = stream.match(/^([r&^$%]?)("""|'''|"|')/);
    if (literal) {
      state.string = { end: literal[2], raw: literal[1] === 'r' };
      return readString(stream, state);
    }
    if (stream.match(/^\$[\p{ID_Start}_][\p{ID_Continue}/]*/u)) return 'string';
    if (stream.match(number)) return 'number';
    const word = stream.match(identifier)?.[0];
    if (word) {
      if (keywords.has(word)) return 'keyword';
      if (atoms.has(word)) return 'atom';
      if (builtinTypes.has(word)) return 'typeName';
      if (stream.match(/^\s*\(/, false)) return 'variableName.function';
      return 'variableName';
    }
    const char = stream.next();
    if (Object.hasOwn(closing, char)) {
      state.brackets.push({ end: closing[char], indent: state.indent });
      return 'bracket';
    }
    if (state.brackets.at(-1)?.end === char) {
      state.brackets.pop();
      return 'bracket';
    }
    if (char === ':' && !state.brackets.length && stream.match(/^\s*(?:#.*)?$/, false)) state.block = true;
    return /[+*/%=<>!&|^~:-]/.test(char) ? 'operator' : 'punctuation';
  },
  indent(state, textAfter, context) {
    if (state.string) return null;
    const open = state.brackets.at(-1);
    if (open) return textAfter.startsWith(open.end) ? open.indent : open.indent + context.unit;
    return state.indent + (state.block ? context.unit : 0);
  },
});
