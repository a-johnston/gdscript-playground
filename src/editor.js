import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { gdscript } from './gdscript.js';

const indentWidth = 4;

function normalizePastedIndentation(text) {
  // Expand leading tabs to tab stops, leaving tabs within the line untouched.
  return text.replace(/^[ \t]*\t[ \t]*/gm, indent => {
    let column = 0;
    for (const char of indent) column += char === '\t' ? indentWidth - column % indentWidth : 1;
    return ' '.repeat(column);
  });
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: [tags.atom, tags.number], color: 'var(--syntax-literal)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.comment, color: 'var(--syntax-comment)' },
  { tag: [tags.typeName, tags.meta], color: 'var(--syntax-type)' },
  { tag: tags.function(tags.variableName), color: 'var(--syntax-function)' },
]);

export function mountEditor({ parent, source, onRun, onEdit }) {
  const theme = new Compartment();
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  const view = new EditorView({
    parent,
    doc: source,
    extensions: [
      EditorView.contentAttributes.of({ 'aria-label': 'GDScript source' }),
      EditorState.tabSize.of(indentWidth), indentUnit.of(' '.repeat(indentWidth)), gdscript,
      EditorView.clipboardInputFilter.of(normalizePastedIndentation),
      lineNumbers(),
      drawSelection(),
      history(),
      indentOnInput(),
      syntaxHighlighting(highlightStyle),
      lintGutter(),
      highlightActiveLineGutter(),
      theme.of(EditorView.darkTheme.of(prefersDark.matches)),
      keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of(update => { if (update.docChanged) onEdit(); }),
    ],
  });

  prefersDark.addEventListener('change', ({ matches }) => {
    view.dispatch({ effects: theme.reconfigure(EditorView.darkTheme.of(matches)) });
  });

  return {
    get source() { return view.state.doc.toString(); },
    set source(doc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
    },
    setDiagnostics(items) {
      const { doc } = view.state;
      const diagnostics = items.filter(({ line }) => line >= 1 && line <= doc.lines).map(({ line, message }) => {
        const { from, to } = doc.line(line);
        return { from, to, message, severity: 'error' };
      });
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    jumpToLine(line) {
      if (line < 1 || line > view.state.doc.lines) return;
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(line).from), scrollIntoView: true });
      view.focus();
    },
  };
}
