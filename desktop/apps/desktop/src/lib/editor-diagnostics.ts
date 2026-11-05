import { EditorView } from "@codemirror/view";

/** Presentation only: keep lint state, gutter markers and Problems diagnostics. */
export function diagnosticUnderlineTheme(visible: boolean) {
  return visible
    ? []
    : EditorView.theme({
        ".cm-lintRange": { backgroundImage: "none !important" },
      });
}
