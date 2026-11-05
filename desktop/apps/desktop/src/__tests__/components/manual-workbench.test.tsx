import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  files: [
    {
      id: "main.tex",
      relativePath: "main.tex",
      content: "original",
      isDirty: false,
    },
  ],
  save: vi.fn(),
  jump: vi.fn(),
  active: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@/lib/backend", () => ({ invoke: m.invoke }));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: Object.assign(
    (f: any) => f({ projectId: "p", contentGeneration: 0, files: m.files }),
    {
      getState: () => ({
        projectId: "p",
        files: m.files,
        saveAllFiles: m.save,
        setActiveFile: m.active,
        requestJumpToPosition: m.jump,
      }),
    },
  ),
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: { getState: () => ({ selectedModel: "existing-model" }) },
}));
import {
  ManualWorkbench,
  isReviewStale,
} from "@/components/workspace/manual-workbench";
import {
  useManualStore,
  type ManualData,
  type ManualReview,
} from "@/stores/manual-store";
let data: ManualData, el: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  data = {
    mode: "manual",
    outline: [],
    reviews: [],
    currentRevision: "version1",
  };
  m.files[0].isDirty = false;
  m.files[0].content = "original";
  m.invoke.mockImplementation(async (_cmd, args) => {
    if (args.action === "save") data = { ...data, ...args.args };
    return data;
  });
  useManualStore.setState({ project: "p", data, busy: false, error: "" });
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const button = (text: string) =>
  Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  )!;
it("offers only the three reviews and saves before explicit review; never writes repairs", async () => {
  data.reviews = [
    {
      id: "r",
      kind: "proof",
      revision: "version1",
      sources: { "main.tex": "original" },
      createdAt: "today",
      state: "completed",
      result: {
        outcome: "gap",
        findings: [
          {
            path: "main.tex",
            line: 1,
            issue: "missing premise",
            repair: "unverified repair",
          },
        ],
        limitations: "citation unavailable",
      },
    },
  ];
  await act(async () => root.render(<ManualWorkbench />));
  expect(m.invoke.mock.calls.some(([, a]) => a.action === "start")).toBe(false);
  await act(async () => button("审查记录 (1)").click());
  expect(el.textContent).toContain("发现的问题：missing premise");
  expect(el.textContent).toContain(
    "建议修补（未核验，需手动采用）：unverified repair",
  );
  expect(el.textContent).not.toContain("应用修补");
  expect(el.textContent).toContain("计算审查仅由模型推导，未执行计算程序。");
  expect(el.querySelectorAll("textarea")).toHaveLength(0);
  await act(async () => button("计算审查（模型推导）").click());
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.invoke).toHaveBeenCalledWith("manual_operation", {
    projectId: "p",
    action: "start",
    args: { kind: "calculation", model: "existing-model" },
  });
});
it("marks dirty, changed, and unknown versions stale and disables source navigation", async () => {
  const review: ManualReview = {
    id: "r",
    kind: "proof",
    revision: "version1",
    sources: { "main.tex": "original" },
    createdAt: "today",
    state: "completed",
    result: {
      outcome: "no_issue_found",
      findings: [],
      limitations: "limited scope",
    },
  };
  expect(isReviewStale(review, "version1", m.files)).toBe(false);
  expect(isReviewStale(review, undefined, m.files)).toBe(true);
  expect(isReviewStale(review, "version2", m.files)).toBe(true);
  m.files[0].isDirty = true;
  expect(isReviewStale(review, "version1", m.files)).toBe(true);
  m.files[0].isDirty = false;
  m.files[0].content = "human edit";
  expect(isReviewStale(review, "version1", m.files)).toBe(true);
});
it("mode changes go through backend and running review disables switching", async () => {
  await act(async () => root.render(<ManualWorkbench />));
  const mode = el.querySelector(
    'select[aria-label="写作方式"]',
  ) as HTMLSelectElement;
  await act(async () => {
    mode.value = "agent";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(m.invoke).toHaveBeenCalledWith("manual_operation", {
    projectId: "p",
    action: "save",
    args: { mode: "agent" },
  });
  data = {
    mode: "manual",
    outline: [],
    reviews: [
      {
        id: "r",
        state: "running",
        kind: "proof",
        revision: "v",
        sources: {},
        createdAt: "now",
      },
    ],
  };
  await act(async () => useManualStore.setState({ data }));
  expect(mode.disabled).toBe(true);
  await act(async () => button("取消审查").click());
  expect(m.invoke).toHaveBeenCalledWith("manual_operation", {
    projectId: "p",
    action: "cancel",
    args: {},
  });
});

it("legacy metadata migrates only after explicit choice and includes the verified digest", async () => {
  data.storageStatus = "legacy";
  data.legacyDigest = "verified-legacy-digest";
  await act(async () => root.render(<ManualWorkbench />));
  expect(
    m.invoke.mock.calls.some(([, args]) => args.action === "migrate"),
  ).toBe(false);
  await act(async () => button("迁移当前论文的大纲与审查记录").click());
  expect(m.invoke).toHaveBeenCalledWith("manual_operation", {
    projectId: "p",
    action: "migrate",
    args: { legacyDigest: "verified-legacy-digest" },
  });
});

it("portable edits include expected heads and do not silently resolve concurrent revisions", async () => {
  data.storageStatus = "conflict";
  data.storageHeads = ["left", "right"];
  data.storageChoices = [
    {
      id: "left",
      createdAt: "today",
      data: { mode: "manual", outline: [], reviews: [] },
    },
    {
      id: "right",
      createdAt: "today",
      data: { mode: "manual", outline: [], reviews: [] },
    },
  ];
  await act(async () => root.render(<ManualWorkbench />));
  expect(el.textContent).toContain("检测到并发版本");
  expect(
    (el.querySelector('select[aria-label="写作方式"]') as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect(el.textContent).not.toContain("计算审查（模型推导）");
  const choose = Array.from(el.querySelectorAll("button")).filter(
    (b) => b.textContent === "采用此版本，保留其他历史",
  );
  await act(async () => choose[0].click());
  expect(m.invoke).toHaveBeenCalledWith("manual_operation", {
    projectId: "p",
    action: "resolveStorage",
    args: { revisionId: "left", expectedHeads: ["left", "right"] },
  });
});

it("unreadable metadata clears an old successful view instead of keeping it apparently current", async () => {
  m.invoke.mockRejectedValueOnce(
    new Error("Damaged manual metadata; original retained"),
  );
  await act(async () => useManualStore.getState().load("p"));
  expect(useManualStore.getState().data).toBeNull();
  expect(useManualStore.getState().error).toContain("Damaged manual metadata");
});
