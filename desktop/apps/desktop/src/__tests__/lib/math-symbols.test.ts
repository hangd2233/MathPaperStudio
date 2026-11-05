import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import katex from "katex";
import {
  mathTemplates,
  searchTemplates,
  mathContext,
  symbolInsertion,
  previewLatex,
} from "@/lib/math-symbols";
const fraction = mathTemplates.find((t) => t.id === "fraction")!;
describe("manual math symbol insertion", () => {
  it("searches Chinese, English and exact LaTeX commands without editing", () => {
    expect(searchTemplates(mathTemplates, "分式")[0]).toBe(fraction);
    expect(searchTemplates(mathTemplates, "fraction")[0]).toBe(fraction);
    expect(searchTemplates(mathTemplates, "\\frac")[0]).toBe(fraction);
    expect(searchTemplates(mathTemplates, "does-not-exist")).toHaveLength(0);
  });
  it("renders every bundled preset without undefined custom macros", () => {
    for (const t of mathTemplates)
      expect(() =>
        katex.renderToString(previewLatex(t.latex), {
          throwOnError: true,
          trust: false,
          strict: "error",
        }),
      ).not.toThrow();
  });
  it("recognizes standard math environments while ignoring comments and escaped dollars", () => {
    for (const text of ["$x", "$$x", "\\(x", "\\[x", "\\begin{align*} x &=y"])
      expect(mathContext(text)).toBe(true);
    for (const text of [
      "text \\$ x",
      "% $\n text",
      "$x$ text",
      "\\begin{equation}x\\end{equation}",
      "\\verb|$|",
      "\\begin{verbatim}$\\end{verbatim}",
    ])
      expect(mathContext(text)).toBe(false);
  });
  it("wraps selected text in the first placeholder with one undo transaction", () => {
    let state = EditorState.create({
      doc: "Before x+y after",
      selection: EditorSelection.single(7, 10),
      extensions: [history()],
    });
    state = state.update(symbolInsertion(state, fraction, "auto")).state;
    expect(state.doc.toString()).toBe(
      "Before $\\frac{ x+y }{ denominator }$ after",
    );
    expect(
      state.sliceDoc(state.selection.main.from, state.selection.main.to),
    ).toBe("x+y");
    undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    expect(state.doc.toString()).toBe("Before x+y after");
    expect(state.selection.main.from).toBe(7);
  });
  it("avoids duplicate delimiters, positions placeholders and separates control words", () => {
    let s = EditorState.create({ doc: "$x$", selection: { anchor: 2 } });
    let t = s.update(symbolInsertion(s, fraction, "display")).state;
    expect(t.doc.toString()).toBe("$x\\frac{ numerator }{ denominator }$");
    expect(t.sliceDoc(t.selection.main.from, t.selection.main.to)).toBe(
      "numerator",
    );
    s = EditorState.create({ doc: "$xy$", selection: { anchor: 2 } });
    t = s.update(
      symbolInsertion(s, mathTemplates.find((t) => t.id === "alpha")!, "auto"),
    ).state;
    expect(t.doc.toString()).toBe("$x\\alpha{}y$");
  });
  it("rejects math-boundary selections and leaves state unchanged", () => {
    const state = EditorState.create({
      doc: "$x$ text",
      selection: EditorSelection.single(1, 7),
    });
    expect(() => symbolInsertion(state, fraction, "auto")).toThrow("边界");
    expect(state.doc.toString()).toBe("$x$ text");
    expect(() => symbolInsertion(state, fraction, "raw")).not.toThrow();
  });
  it("inserts repeated symbols as independently undoable edits", () => {
    let state = EditorState.create({ doc: "", extensions: [history()] });
    const alpha = mathTemplates.find((t) => t.id === "alpha")!;
    state = state.update(symbolInsertion(state, alpha, "raw")).state;
    state = state.update(symbolInsertion(state, alpha, "raw")).state;
    undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    expect(state.doc.toString()).toBe("\\alpha");
  });
});
