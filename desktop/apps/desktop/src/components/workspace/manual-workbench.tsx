import { ReportPlanner } from "./report-planner";
import { usePlanningStore } from "@/stores/planning-store";
import { usePreviewStore } from "@/stores/preview-store";
import { useEffect, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";
import {
  useManualStore,
  type ManualReview,
  type OutlineItem,
} from "@/stores/manual-store";

const field = "rounded border bg-background px-2 py-1 text-xs min-w-0";
const button =
  "whitespace-nowrap rounded border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40";
const kinds = {
  section: "章节",
  subsection: "小节",
  theorem: "定理",
  lemma: "引理",
  proof: "证明步骤",
};
const statuses = {
  todo: "待写",
  draft: "草稿",
  check: "待核验",
  confirmed: "已确认",
};
const reviews = {
  language: "语言语法",
  proof: "证明逻辑与引用",
  calculation: "计算审查（模型推导）",
};
export function isReviewStale(
  review: ManualReview,
  currentRevision: string | undefined,
  files: { relativePath: string; content?: string; isDirty: boolean }[],
) {
  return (
    !currentRevision ||
    review.revision !== currentRevision ||
    files.some(
      (f) => f.isDirty && /\.(tex|bib|sty|cls)$/.test(f.relativePath),
    ) ||
    files.some(
      (f) =>
        f.content !== undefined &&
        f.relativePath in review.sources &&
        f.content !== review.sources[f.relativePath],
    )
  );
}
function navigate(path: string, line: number) {
  const s = useDocumentStore.getState();
  const f = s.files.find((f) => f.relativePath === path);
  if (!f || f.content === undefined)
    throw new Error("关联源码未加载；请从文件列表打开后重试。");
  const lines = f.content.split("\n");
  if (line < 1 || line > lines.length)
    throw new Error("源码行号已改变，请更新关联。");
  s.setActiveFile(f.id);
  s.requestJumpToPosition(
    lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0),
  );
}
export function ManualWorkbench({ sidebar = false }: { sidebar?: boolean }) {
  const s = useManualStore();
  const project = useDocumentStore((s) => s.projectId);
  const files = useDocumentStore((s) => s.files);
  const generation = useDocumentStore((s) => s.contentGeneration);
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState("outline");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (project) void s.load(project);
  }, [project]);
  const running = s.data?.reviews.some((r) => r.state === "running");
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(
      () => void useManualStore.getState().load(project),
      300,
    );
    return () => clearTimeout(timer);
  }, [project, generation]);
  useEffect(() => {
    if (!project || !running) return;
    const timer = setInterval(
      () => void useManualStore.getState().load(project),
      1000,
    );
    return () => clearInterval(timer);
  }, [project, running]);
  const data = s.project === project ? s.data : null;
  useEffect(() => {
    if (data?.mode === "manual") {
      usePreviewStore.getState().setEditorVisible(true);
    }
  }, [project, data?.mode]);
  const plannerBusy = usePlanningStore(
    (s) =>
      s.project === project &&
      (s.busy || !!s.data?.runs.some((r) => r.state === "running")),
  );
  const blocked =
    s.busy || running || plannerBusy || data?.storageStatus === "conflict";
  const go = (path: string, line: number) => {
    try {
      navigate(path, line);
      setLocalError("");
    } catch (e) {
      setLocalError(String(e));
    }
  };
  const change = (item: OutlineItem, patch: Partial<OutlineItem>) =>
    void s.act("save", {
      outline: data?.outline.map((i) =>
        i.id === item.id ? { ...i, ...patch } : i,
      ),
    });
  async function start(kind: string) {
    setLocalError("");
    try {
      await useDocumentStore.getState().saveAllFiles();
      if (useDocumentStore.getState().files.some((f) => f.isDirty))
        throw new Error("请先保存所有源文件，再开始审查。");
      await useManualStore.getState().act("start", {
        kind,
        model: useAgentChatStore.getState().selectedModel,
      });
      setTab("reviews");
    } catch (e) {
      setLocalError(String(e));
    }
  }
  return (
    <section
      aria-label="Writing mode"
      className="shrink-0 border-b bg-background"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <strong className="text-sm">写作方式</strong>
        <select
          aria-label="写作方式"
          className={field}
          value={data?.mode ?? ""}
          disabled={!data || blocked}
          onChange={(e) => void s.act("save", { mode: e.target.value })}
        >
          {!data && <option value="">正在读取项目模式…</option>}
          <option value="agent">Agent 写作</option>
          <option value="manual">手搓模式</option>
        </select>
        {data?.storageStatus === "legacy" && (
          <div className="space-y-2 border-t px-3 py-2 text-xs">
            <p>
              大纲与审查记录仍在本机应用数据中。迁移会先校验备份，再写入当前论文的
              .mps/，保留旧记录。论文若仍在旧目录，需先按你的选择放入 MPS-Papers
              才会随新工作区同步。
            </p>
            <button
              className={button}
              disabled={s.busy || running}
              onClick={() => void s.act("migrate")}
            >
              迁移当前论文的大纲与审查记录
            </button>
          </div>
        )}
        {data?.storageStatus === "portable" && (
          <p className="px-3 pb-2 text-muted-foreground text-xs">
            随行存储：当前论文/.mps/ · 版本历史保留 · 项目{" "}
            {data.stableProjectId?.slice(0, 8)}
          </p>
        )}
        {data?.storageStatus === "new" && (
          <p className="px-3 pb-2 text-muted-foreground text-xs">
            首次保存将在当前论文目录内建立 .mps/，用于随论文同步。
          </p>
        )}
        {data?.storageStatus === "conflict" && (
          <div
            role="alert"
            className="max-h-64 space-y-2 overflow-y-auto border-t px-3 py-2 text-xs"
          >
            <strong>
              检测到并发版本，已保留全部历史。请先比较，再明确选择一个版本继续；不会自动合并或覆盖。
            </strong>
            {data.storageChoices?.map((choice) => (
              <div className="rounded border p-2" key={choice.id}>
                <p>
                  {choice.createdAt} · {choice.id.slice(0, 8)} · 大纲{" "}
                  {choice.data.outline.length} 条 · 审查{" "}
                  {choice.data.reviews.length} 条
                </p>
                <details>
                  <summary>比较此版本的完整记录</summary>
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(choice.data, null, 2)}
                  </pre>
                </details>
                <button
                  className={button}
                  disabled={s.busy || running}
                  onClick={() =>
                    void s.act("resolveStorage", { revisionId: choice.id })
                  }
                >
                  采用此版本，保留其他历史
                </button>
              </div>
            ))}
          </div>
        )}
        {data?.mode === "manual" && data.storageStatus !== "conflict" && (
          <span className="text-muted-foreground text-xs">
            人工撰写 · 审查建议由你手动采用
          </span>
        )}
      </div>
      {(s.error || localError) && (
        <p role="alert" className="px-3 pb-2 text-destructive text-xs">
          {s.error || localError}
        </p>
      )}
      {!data && s.error && project && (
        <button className={button} onClick={() => void s.load(project)}>
          重新读取模式
        </button>
      )}
      {data?.mode === "manual" && (
        <div className="px-3 pb-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              className={button}
              aria-pressed={tab === "outline"}
              onClick={() => setTab("outline")}
            >
              大纲与进度 (
              {data.outline.filter((i) => i.status === "confirmed").length}/
              {data.outline.length})
            </button>
            <button
              className={button}
              aria-pressed={tab === "reviews"}
              onClick={() => setTab("reviews")}
            >
              审查记录 ({data.reviews.length})
            </button>
            <button
              className={button}
              aria-pressed={tab === "planning"}
              onClick={() => setTab("planning")}
            >
              报告与英文大纲
            </button>
            {running && (
              <button
                className={button}
                disabled={s.busy}
                onClick={() => void s.act("cancel")}
              >
                取消审查
              </button>
            )}
          </div>
          {tab === "planning" && project ? (
            <ReportPlanner project={project} sidebar={sidebar} />
          ) : tab === "outline" ? (
            <div
              className={
                sidebar ? "space-y-2" : "max-h-56 space-y-2 overflow-y-auto"
              }
            >
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (title.trim()) {
                    void s.act("save", {
                      outline: [
                        ...data.outline,
                        {
                          id: crypto.randomUUID(),
                          title: title.trim(),
                          kind: "section",
                          status: "todo",
                          path: "",
                          line: 1,
                        },
                      ],
                    });
                    setTitle("");
                  }
                }}
              >
                <input
                  aria-label="新大纲条目"
                  className={`${field} flex-1`}
                  placeholder="输入你的章节、定理或证明步骤"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button className={button} disabled={blocked || !title.trim()}>
                  添加条目
                </button>
              </form>
              {!data.outline.length && (
                <p className="text-muted-foreground text-xs">
                  先添加自己的写作大纲，再在下方 LaTeX
                  编辑器中撰写。大纲不会生成或改写正文。
                </p>
              )}
              {data.outline.map((i) => (
                <div
                  key={i.id}
                  className={`space-y-1 rounded border p-2 ${i.kind === "subsection" ? "ml-4" : ""}`}
                >
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label={`条目类型 ${i.title}`}
                      className={field}
                      value={i.kind}
                      disabled={blocked}
                      onChange={(e) => change(i, { kind: e.target.value })}
                    >
                      {Object.entries(kinds).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`条目标题 ${i.title}`}
                      className={`${field} flex-1 ${sidebar ? "order-first basis-full" : ""}`}
                      defaultValue={i.title}
                      key={i.title}
                      disabled={blocked}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== i.title)
                          change(i, { title: e.target.value.trim() });
                      }}
                    />
                    <select
                      aria-label={`进度 ${i.title}`}
                      className={field}
                      value={i.status}
                      disabled={blocked}
                      onChange={(e) => change(i, { status: e.target.value })}
                    >
                      {Object.entries(statuses).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${field} flex-1 ${sidebar ? "basis-full" : ""}`}
                      aria-label={`源码文件 ${i.title}`}
                      placeholder="关联源码，如 main.tex"
                      defaultValue={i.path}
                      key={i.path}
                      disabled={blocked}
                      onBlur={(e) => {
                        if (e.target.value !== i.path)
                          change(i, { path: e.target.value });
                      }}
                    />
                    <input
                      className={`${field} w-16`}
                      type="number"
                      min={1}
                      aria-label={`源码行号 ${i.title}`}
                      defaultValue={i.line}
                      key={i.line}
                      disabled={blocked}
                      onBlur={(e) => {
                        const line = Number(e.target.value);
                        if (
                          Number.isInteger(line) &&
                          line > 0 &&
                          line !== i.line
                        )
                          change(i, { line });
                      }}
                    />
                    <button
                      className={button}
                      disabled={!i.path}
                      onClick={() => go(i.path, i.line)}
                    >
                      定位
                    </button>
                    <button
                      className={button}
                      disabled={blocked}
                      onClick={() =>
                        void s.act("save", {
                          outline: data.outline.filter((o) => o.id !== i.id),
                        })
                      }
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={
                sidebar ? "space-y-3" : "max-h-64 space-y-3 overflow-y-auto"
              }
            >
              <div className="flex flex-wrap gap-2">
                {Object.entries(reviews).map(([kind, title]) => (
                  <button
                    key={kind}
                    className={button}
                    disabled={blocked}
                    onClick={() => void start(kind)}
                  >
                    {title}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                审查已保存的 LaTeX / BibTeX
                源码。只读会话无写入或提权入口。计算审查仅由模型推导，未执行计算程序。引用原文缺失或不能核验的内容会注明无法判断；未发现问题不等于证明成立。
              </p>
              {[...data.reviews].reverse().map((r) => {
                const stale = isReviewStale(r, data.currentRevision, files);
                return (
                  <article
                    key={r.id}
                    className="space-y-2 rounded border p-2 text-xs"
                  >
                    <div className="font-medium">
                      {reviews[r.kind as keyof typeof reviews]} ·{" "}
                      {r.state === "running"
                        ? "审查中"
                        : r.state === "completed"
                          ? ({
                              gap: "发现缺口",
                              no_issue_found: "未发现问题",
                              unable_to_assess: "无法判断",
                            }[r.result?.outcome ?? ""] ?? "无法判断")
                          : r.state === "cancelled"
                            ? "已取消"
                            : r.state === "interrupted"
                              ? "已中断"
                              : "审查失败"}
                    </div>
                    <p className="text-muted-foreground">
                      {r.createdAt} · 源码版本 {r.revision.slice(0, 12)}
                      {stale
                        ? " · 已过期：正文已更改，请重新审查"
                        : " · 对应已保存版本"}
                    </p>
                    {r.result?.findings.map((f, index) => (
                      <div key={index} className="space-y-1 border-l-2 pl-2">
                        <button
                          className="underline disabled:opacity-40"
                          disabled={stale}
                          onClick={() => go(f.path, f.line)}
                        >
                          {f.path}:{f.line}
                        </button>
                        <p className="whitespace-pre-wrap">
                          <strong>发现的问题：</strong>
                          {f.issue}
                        </p>
                        {f.repair && (
                          <p className="whitespace-pre-wrap">
                            <strong>建议修补（未核验，需手动采用）：</strong>
                            {f.repair}
                          </p>
                        )}
                      </div>
                    ))}
                    {r.result?.limitations && (
                      <p className="whitespace-pre-wrap">
                        核验范围与限制：{r.result.limitations}
                      </p>
                    )}
                    {r.error && <p role="alert">{r.error}</p>}
                    {r.raw && (
                      <details>
                        <summary>原始审查回复</summary>
                        <pre className="whitespace-pre-wrap">{r.raw}</pre>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
