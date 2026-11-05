import { Annotation } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";

export const backendReload = Annotation.define<boolean>();

// CodeMirror stores logical lines with LF. Loading a CRLF source is not an edit.
export function editorDocumentMatchesSource(
  editorText: string,
  source: string,
) {
  return editorText === source.replace(/\r\n?/g, "\n");
}

export function editorContentForSource(editorText: string, source: string) {
  return source.includes("\r\n")
    ? editorText.replace(/\r?\n/g, "\r\n")
    : editorText;
}

export function shouldPersistEditorUpdate(update: ViewUpdate) {
  return (
    update.docChanged &&
    !update.transactions.some((transaction) =>
      transaction.annotation(backendReload),
    )
  );
}
