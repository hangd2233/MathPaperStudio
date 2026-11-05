import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  action: vi.fn(),
  refresh: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  ask: vi.fn(),
  write: vi.fn(),
  exists: vi.fn(),
  invoke: vi.fn(),
  read: vi.fn(),
  extract: vi.fn(),
  data: {} as any,
}));
vi.mock("@/stores/planning-store", () => ({
  usePlanningStore: Object.assign(
    () => ({
      project: "p",
      data: m.data,
      busy: false,
      error: "",
      load: m.load,
      act: m.action,
    }),
    { getState: () => ({ load: m.load }) },
  ),
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: {
    getState: () => ({
      selectedModel: "existing-selection",
      effortLevel: "medium",
    }),
  },
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ refreshFiles: m.refresh }) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: m.open,
  save: m.save,
  ask: m.ask,
}));
vi.mock("@/lib/backend", () => ({ invoke: m.invoke }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: m.read,
  writeFile: m.write,
  exists: m.exists,
}));
vi.mock("@/lib/report-planning", async (original) => ({
  ...(await original<any>()),
  extractReport: m.extract,
}));
import { ReportPlanner } from "@/components/workspace/report-planner";
let el: HTMLDivElement, root: ReturnType<typeof createRoot>;
const button = (text: string) =>
  Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  )!;
beforeEach(() => {
  vi.clearAllMocks();
  m.load.mockResolvedValue(undefined);
  m.save.mockResolvedValue("/isolated/outline.pdf");
  m.exists.mockResolvedValue(false);
  m.ask.mockResolvedValue(false);
  m.write.mockResolvedValue(undefined);
  m.invoke.mockResolvedValue({
    runId: "run",
    bytes: [37, 80, 68, 70, 45, 49],
    warnings: [],
  });
  m.refresh.mockResolvedValue(undefined);
  const outline = {
    title: "Quotient geometry",
    mainline: "Geometry first.",
    sections: [
      {
        id: "s1",
        title: "Introduction",
        purpose: "State the scope.",
        claims: [],
        proofSteps: ["Explain hypotheses."],
        dependencies: [],
        sources: [{ sourceId: "source", page: 1, section: "Scope" }],
        openQuestions: [],
      },
    ],
    limitations: ["No novelty check."],
    noveltyStatus: "not_assessed",
  };
  m.data = {
    mode: "manual",
    storageStatus: "portable",
    storageHeads: ["h1"],
    inputDigest: "input",
    reports: [
      {
        id: "source",
        name: "report.pdf",
        pages: [{ page: 1, text: "Source text.", status: "readable" }],
        warnings: [],
      },
    ],
    requirements: "English outline",
    mainline: "Geometry first.",
    selectionConfirmed: true,
    options: [],
    applied: [],
    runs: [
      {
        id: "run",
        kind: "outline",
        state: "completed",
        inputDigest: "input",
        result: outline,
        raw: "actual result",
        createdAt: "today",
      },
    ],
  };
  m.action.mockImplementation(async (a) =>
    a === "preview"
      ? {
          runId: "run",
          path: "mps-outline-run.tex",
          latex: "\\section{Introduction}\n",
          previewDigest: "view",
          outline,
        }
      : m.data,
  );
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("requires a current preview and explicit user confirmation before headings creation", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  expect(m.action).not.toHaveBeenCalled();
  expect(button("确认建立骨架与导航")).toBeUndefined();
  await act(async () => button("预览标题骨架与导航变更").click());
  expect(button("确认建立骨架与导航").disabled).toBe(true);
  const label = Array.from(el.querySelectorAll("label")).find((l) =>
    l.textContent?.includes("我已查看最新预览"),
  )!;
  await act(async () => label.querySelector("input")!.click());
  await act(async () => button("确认建立骨架与导航").click());
  expect(m.action).toHaveBeenCalledWith("apply", {
    runId: "run",
    previewDigest: "view",
    confirmed: true,
  });
  expect(m.refresh).toHaveBeenCalledOnce();
});
it("blocks stale-outline preview and exposes preserved historical result", async () => {
  m.data.inputDigest = "changed";
  await act(async () => root.render(<ReportPlanner project="p" />));
  expect(button("预览标题骨架与导航变更").disabled).toBe(true);
  expect(el.textContent).toContain("要求/材料/主线已变更");
  expect(
    (el.querySelector('input[aria-label="英文论文标题"]') as HTMLInputElement)
      .value,
  ).toBe("Quotient geometry");
});
it("invalidates confirmation when the user changes unsaved writing requirements", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  await act(async () => button("预览标题骨架与导航变更").click());
  expect(button("确认建立骨架与导航")).toBeDefined();
  const textarea = el.querySelector(
    'textarea[aria-label="写作要求"]',
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, "Changed unsaved requirements");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("预览标题骨架与导航变更").disabled).toBe(true);
  expect(button("确认建立骨架与导航")).toBeUndefined();
  expect(m.action.mock.calls.filter((c) => c[0] === "apply")).toHaveLength(0);
});
it("canceling PDF selection causes no import, and parse failure is explicit", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  m.open.mockResolvedValueOnce(null);
  await act(async () => button("导入 PDF 报告（可多选）").click());
  expect(m.read).not.toHaveBeenCalled();
  expect(m.action).not.toHaveBeenCalled();
  m.open.mockResolvedValueOnce(["/test/broken.pdf"]);
  m.read.mockResolvedValueOnce(new Uint8Array([1]));
  m.extract.mockRejectedValueOnce(new Error("invalid xref"));
  await act(async () => button("导入 PDF 报告（可多选）").click());
  expect(el.textContent).toContain("PDF 未能完整导入");
  expect(m.action).not.toHaveBeenCalled();
});

it("does not commit a late PDF extraction result after import cancellation", async () => {
  let finish!: (pages: any[]) => void;
  m.open.mockResolvedValueOnce(["/test/slow.pdf"]);
  m.read.mockResolvedValueOnce(new Uint8Array([1]));
  m.extract.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<ReportPlanner project="p" />));
  await act(async () => button("导入 PDF 报告（可多选）").click());
  expect(m.extract).toHaveBeenCalledOnce();
  await act(async () => button("取消导入后续步骤").click());
  await act(async () =>
    finish([{ page: 1, status: "readable", text: "Late source." }]),
  );
  expect(m.action).not.toHaveBeenCalled();
  expect(el.textContent).not.toContain("PDF 未能完整导入");
  expect(button("导入 PDF 报告（可多选）").disabled).toBe(false);
});

it("exports exactly the selected saved historical version without planning mutation", async () => {
  m.data.runs.push({ ...m.data.runs[0], id: "latest", createdAt: "later" });
  await act(async () => root.render(<ReportPlanner project="p" />));
  const select = el.querySelector(
    'select[aria-label="大纲版本"]',
  ) as HTMLSelectElement;
  await act(async () => {
    select.value = "run";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.invoke).toHaveBeenCalledWith("planning_operation", {
    projectId: "p",
    action: "exportPDF",
    args: { runId: "run", expectedHeads: ["h1"] },
  });
  expect(m.write).toHaveBeenCalledWith(
    "/isolated/outline.pdf",
    new Uint8Array([37, 80, 68, 70, 45, 49]),
  );
  expect(m.action).not.toHaveBeenCalled();
  expect(el.textContent).toContain("已导出保存版本 run");
  await act(async () => {
    select.value = "latest";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(el.textContent).not.toContain("已导出保存版本 run");
});
it("save cancellation and non-PDF destinations never compile or write", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  m.save.mockResolvedValueOnce(null);
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.invoke).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
  m.save.mockResolvedValueOnce("/isolated/main.tex");
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.invoke).not.toHaveBeenCalled();
  expect(el.textContent).toContain(".pdf");
});
it("invalid unsaved structural edits disable saved-version export", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  const textarea = el.querySelector(
    'textarea[aria-label="完整大纲结构"]',
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, "{invalid unsaved edit");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("导出大纲为 PDF").disabled).toBe(true);
  expect(el.textContent).toContain("存在未保存修改");
});
it("duplicate clicks cannot start duplicate exports; cancellation discards late compilation", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  let finish!: (v: unknown) => void;
  m.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    button("导出大纲为 PDF").click();
    button("导出大纲为 PDF").click();
  });
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.invoke).toHaveBeenCalledOnce();
  await act(async () => button("取消导出").click());
  await act(async () =>
    finish({ runId: "run", bytes: [37, 80, 68, 70, 45, 49], warnings: [] }),
  );
  expect(m.write).not.toHaveBeenCalled();
  expect(button("导出大纲为 PDF").disabled).toBe(false);
});
it("project switch during a save dialog discards the old job", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  let finish!: (v: unknown) => void;
  m.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => button("导出大纲为 PDF").click());
  await act(async () => root.render(<ReportPlanner project="other-project" />));
  await act(async () => finish("/isolated/outline.pdf"));
  expect(m.invoke).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
});
it("compiler failure is recoverable and mismatched versions never write", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  m.invoke.mockRejectedValueOnce(new Error("pdflatex unavailable"));
  await act(async () => button("导出大纲为 PDF").click());
  expect(el.textContent).toContain("pdflatex unavailable");
  expect(m.write).not.toHaveBeenCalled();
  m.invoke.mockResolvedValueOnce({
    runId: "wrong",
    bytes: [37, 80, 68, 70, 45],
    warnings: [],
  });
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.write).not.toHaveBeenCalled();
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.write).toHaveBeenCalledOnce();
});
it("existing PDF requires explicit overwrite approval", async () => {
  await act(async () => root.render(<ReportPlanner project="p" />));
  m.exists.mockResolvedValue(true);
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.ask).toHaveBeenCalledOnce();
  expect(m.write).not.toHaveBeenCalled();
  m.ask.mockResolvedValueOnce(true);
  await act(async () => button("导出大纲为 PDF").click());
  expect(m.write).toHaveBeenCalledOnce();
});
