import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import {
  backendReload,
  editorContentForSource,
  editorDocumentMatchesSource,
  shouldPersistEditorUpdate,
} from "@/lib/editor-sync";

it("opening or reloading a CRLF manuscript never persists an editor normalization", () => {
  const source =
    "\\documentclass{article}\r\n\\begin{document}\r\nOriginal\r\n\\end{document}\r\n";
  const writes: string[] = [];
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        EditorView.updateListener.of((update) => {
          if (shouldPersistEditorUpdate(update))
            writes.push(update.state.doc.toString());
        }),
      ],
    }),
    parent: document.createElement("div"),
  });
  try {
    expect(editorDocumentMatchesSource(view.state.doc.toString(), source)).toBe(
      true,
    );
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
      annotations: backendReload.of(true),
    });
    expect(writes).toEqual([]);
    expect(source).toContain("\r\n");
  } finally {
    view.destroy();
  }
});

it("real edits are persisted while retaining the manuscript's CRLF convention", () => {
  const source = "First\r\nSecond\r\n";
  const writes: string[] = [];
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        EditorView.updateListener.of((update) => {
          if (shouldPersistEditorUpdate(update))
            writes.push(
              editorContentForSource(update.state.doc.toString(), source),
            );
        }),
      ],
    }),
    parent: document.createElement("div"),
  });
  try {
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "Third\n" },
    });
    expect(writes).toEqual(["First\r\nSecond\r\nThird\r\n"]);
    expect(editorContentForSource("First\nSecond\n", "First\n")).toBe(
      "First\nSecond\n",
    );
  } finally {
    view.destroy();
  }
});
