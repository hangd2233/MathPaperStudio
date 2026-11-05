import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { diagnosticCount, forEachDiagnostic, setDiagnostics } from "@codemirror/lint";
import { expect, it } from "vitest";
import { diagnosticUnderlineTheme } from "@/lib/editor-diagnostics";

it("hides error and warning underlines without losing diagnostics, text or selection", () => {
  const style = new Compartment();
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: "Original author text", selection: { anchor: 3 }, extensions: [style.of(diagnosticUnderlineTheme(true))] }),
  });
  try {
    view.dispatch(setDiagnostics(view.state, [
      { from: 0, to: 8, severity: "warning", message: "warning retained" },
      { from: 9, to: 15, severity: "error", message: "error retained" },
    ]));
    expect(parent.querySelectorAll(".cm-lintRange")).toHaveLength(2);
    view.dispatch({ effects: style.reconfigure(diagnosticUnderlineTheme(false)) });
    for (const range of parent.querySelectorAll(".cm-lintRange")) {
      expect(getComputedStyle(range).backgroundImage).toBe("none");
    }
    expect(diagnosticCount(view.state)).toBe(2);
    const messages: string[] = [];
    forEachDiagnostic(view.state, (diagnostic) => messages.push(diagnostic.message));
    expect(messages).toEqual(["warning retained", "error retained"]);
    expect(view.state.doc.toString()).toBe("Original author text");
    expect(view.state.selection.main.head).toBe(3);
    view.dispatch({ effects: style.reconfigure(diagnosticUnderlineTheme(true)) });
    expect(diagnosticCount(view.state)).toBe(2);
    expect(getComputedStyle(parent.querySelector(".cm-lintRange-error")!).backgroundImage).not.toBe("none");
  } finally { view.destroy(); parent.remove(); }
});
