import { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorState } from "@codemirror/state";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ invoke: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/backend", () => ({ invoke: m.invoke }));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (select: any) =>
    select({ projectId: "p", activeFileId: "main" }),
}));
vi.mock("@/stores/manual-store", () => ({
  useManualStore: { getState: () => ({ load: m.load }) },
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));
import { MathSymbolPanel } from "@/components/workspace/editor/math-symbol-panel";
let el: HTMLDivElement, root: ReturnType<typeof createRoot>, view: any;
const button = (text: string) =>
  Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  )!;
beforeEach(() => {
  vi.clearAllMocks();
  m.invoke.mockResolvedValue({
    storageHeads: ["h"],
    storageStatus: "portable",
  });
  m.load.mockResolvedValue(undefined);
  el = document.createElement("div");
  root = createRoot(el);
  view = {
    state: EditorState.create({ doc: "Human text", selection: { anchor: 5 } }),
    hasFocus: true,
    composing: false,
    focus: vi.fn(),
    dispatch: vi.fn((tr: any) => {
      view.state = view.state.update(tr).state;
    }),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("browsing and cancel leave the editor unchanged; only explicit insert writes once", async () => {
  await act(async () =>
    root.render(<MathSymbolPanel editorView={{ current: view }} enabled />),
  );
  await act(async () => button("Σ 符号库").click());
  expect(view.dispatch).not.toHaveBeenCalled();
  await act(async () => button("取消").click());
  expect(view.dispatch).not.toHaveBeenCalled();
  await act(async () => button("Σ 符号库").click());
  await act(async () => button("插入所选公式").click());
  expect(view.dispatch).toHaveBeenCalledOnce();
  expect(view.focus).toHaveBeenCalled();
  expect(view.state.doc.toString()).toContain("\\frac");
});
it("does not open via composing keyboard input and rejects changed underlying documents", async () => {
  await act(async () =>
    root.render(<MathSymbolPanel editorView={{ current: view }} enabled />),
  );
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "m",
        metaKey: true,
        shiftKey: true,
        isComposing: true,
      }),
    ),
  );
  expect(m.invoke).not.toHaveBeenCalled();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", metaKey: true, shiftKey: true }),
    ),
  );
  view.state = view.state.update({
    changes: { from: 0, insert: "External " },
  }).state;
  await act(async () => button("插入所选公式").click());
  expect(view.dispatch).not.toHaveBeenCalled();
  expect(el.textContent).toContain("编辑目标已变化");
});
it("disables unavailable documents and refuses readonly editor state", async () => {
  await act(async () =>
    root.render(
      <MathSymbolPanel editorView={{ current: null }} enabled={false} />,
    ),
  );
  expect(button("Σ 符号库").disabled).toBe(true);
  view.state = EditorState.create({
    doc: "Readonly",
    extensions: EditorState.readOnly.of(true),
  });
  await act(async () =>
    root.render(<MathSymbolPanel editorView={{ current: view }} enabled />),
  );
  await act(async () => button("Σ 符号库").click());
  expect(m.invoke).not.toHaveBeenCalled();
  expect(view.dispatch).not.toHaveBeenCalled();
});

it("consumes a selection once when duplicate click events arrive before the dialog closes", async () => {
  await act(async () =>
    root.render(<MathSymbolPanel editorView={{ current: view }} enabled />),
  );
  await act(async () => button("Σ 符号库").click());
  const insert = button("插入所选公式");
  await act(async () => {
    insert.click();
    insert.click();
  });
  expect(view.dispatch).toHaveBeenCalledOnce();
  expect(el.textContent).not.toContain("编辑目标已变化");
});
