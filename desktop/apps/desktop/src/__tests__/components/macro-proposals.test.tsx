import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ act: vi.fn(), refresh: vi.fn() }));
vi.mock("@/stores/planning-store", () => ({
  usePlanningStore: () => ({ act: m.act }),
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ refreshFiles: m.refresh }) },
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: {
    getState: () => ({
      selectedModel: "existing-model",
      effortLevel: "medium",
    }),
  },
}));
import { MacroProposals } from "@/components/workspace/macro-proposals";
let root: ReturnType<typeof createRoot>, el: HTMLDivElement;
let data: any;
const button = (s: string) =>
  Array.from(el.querySelectorAll("button")).find((b) => b.textContent === s)!;
beforeEach(() => {
  vi.clearAllMocks();
  m.act.mockResolvedValue({
    path: "new.tex",
    macroPath: "macros.tex",
    macroSource: "\\newcommand{\\pqAutQ}[1]{#1}",
    latex: "new scaffold",
    packages: [],
    warnings: [],
    previewDigest: "digest",
    macroRun: "m",
  });
  el = document.createElement("div");
  root = createRoot(el);
  data = {
    runs: [
      {
        id: "m",
        outlineRun: "o",
        kind: "macros",
        state: "completed",
        inputDigest: "current",
        createdAt: "now",
        result: {
          items: [
            {
              command: "pqAutQ",
              kind: "newcommand",
              arity: 1,
              body: "#1",
              usage: "\\pqAutQ{X}",
              meaning: "Kernel",
              sourceNotation: "Aut_Q",
              sources: [],
              packages: [],
              notes: "Suggested",
              selected: true,
              provenance: "proposed_macro",
            },
          ],
          limitations: [],
        },
      },
    ],
    reports: [],
    applied: [],
    inputDigest: "current",
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("preview does not apply; explicit confirmation is required for macro files", async () => {
  await act(async () =>
    root.render(
      <MacroProposals
        data={data}
        outlineRun="o"
        blocked={false}
        partial={false}
      />,
    ),
  );
  expect(m.act).not.toHaveBeenCalled();
  await act(async () => button("检查冲突并预览宏定义与新 TeX").click());
  expect(button("确认生成宏区与 TeX 骨架").disabled).toBe(true);
  const checkbox = Array.from(
    el.querySelectorAll("input[type=checkbox]"),
  ).slice(-1)[0] as HTMLInputElement;
  await act(async () => checkbox.click());
  await act(async () => button("确认生成宏区与 TeX 骨架").click());
  expect(m.act).toHaveBeenCalledWith(
    "applyMacros",
    expect.objectContaining({ confirmed: true, macroRun: "m", runId: "o" }),
  );
});
it("editing a selection invalidates preview until a new review version is saved", async () => {
  await act(async () =>
    root.render(
      <MacroProposals
        data={data}
        outlineRun="o"
        blocked={false}
        partial={false}
      />,
    ),
  );
  await act(async () => button("检查冲突并预览宏定义与新 TeX").click());
  await act(async () =>
    (
      el.querySelector('input[aria-label="采用宏 1"]') as HTMLInputElement
    ).click(),
  );
  expect(button("确认生成宏区与 TeX 骨架")).toBeUndefined();
  expect(button("检查冲突并预览宏定义与新 TeX").disabled).toBe(true);
  expect(button("保存宏清单审核版本").disabled).toBe(false);
  expect(m.act.mock.calls.some((c) => c[0] === "applyMacros")).toBe(false);
});
it("canceling the preview creates no macro or scaffold request", async () => {
  await act(async () =>
    root.render(
      <MacroProposals
        data={data}
        outlineRun="o"
        blocked={false}
        partial={false}
      />,
    ),
  );
  await act(async () => button("检查冲突并预览宏定义与新 TeX").click());
  await act(async () => button("取消本次宏预览").click());
  expect(button("确认生成宏区与 TeX 骨架")).toBeUndefined();
  expect(m.act.mock.calls.map((c) => c[0])).toEqual(["previewMacros"]);
});
