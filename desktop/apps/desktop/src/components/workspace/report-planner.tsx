import { outlineLabels } from "@/lib/report-planning";
import { MacroProposals } from "./macro-proposals";
import { useEffect, useRef, useState } from "react";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@/lib/backend";
import { usePlanningStore } from "@/stores/planning-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  compareOutlines,
  extractReport,
  parseEditableOutline,
  type HeadingsPreview,
  type OutlineClaim,
  type PaperOutline,
  type ReportCitation,
} from "@/lib/report-planning";

const field = "min-w-0 w-full rounded border bg-background p-2 text-xs";
const button =
  "rounded border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40";
const statuses: Record<string, string> = {
  report_argument: "报告内含论证（尚非独立核验）",
  external_theorem: "外部定理（需核原文）",
  conjecture: "猜想",
  research_plan: "研究计划",
  gap: "未解决缺口",
};

export function ReportPlanner({
  project,
  sidebar = false,
}: {
  project: string;
  sidebar?: boolean;
}) {
  const s = usePlanningStore();
  const data = s.project === project ? s.data : null;
  const [requirements, setRequirements] = useState("");
  const [mainline, setMainline] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<PaperOutline | null>(null);
  const [preview, setPreview] = useState<HeadingsPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [partial, setPartial] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const exportToken = useRef(0);
  const exportLock = useRef(false);
  const importToken = useRef(0);
  const running = data?.runs.some((r) => r.state === "running") ?? false;
  const blocked =
    s.busy ||
    exporting ||
    running ||
    !!progress ||
    data?.storageStatus === "conflict" ||
    data?.mode !== "manual";
  useEffect(() => {
    setExporting(false);
    setSavingPdf(false);
    setExportNotice("");
    void s.load(project);
    return () => {
      importToken.current++;
      exportToken.current++;
      exportLock.current = false;
    };
  }, [project]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => void usePlanningStore.getState().load(project),
      1000,
    );
    return () => clearInterval(timer);
  }, [project, running]);
  useEffect(() => {
    setRequirements(data?.requirements ?? "");
  }, [data?.requirements]);
  useEffect(() => {
    setMainline(data?.mainline ?? "");
  }, [data?.mainline]);
  const outlines =
    data?.runs.filter((r) => r.kind === "outline" && r.state === "completed") ??
    [];
  const selectedRun =
    outlines.find((r) => r.id === selected) ?? outlines[outlines.length - 1];
  const resultKey = JSON.stringify(selectedRun?.result ?? null);
  const exportContext = useRef("");
  exportContext.current = `${project}:${selectedRun?.id}:${resultKey}`;
  useEffect(() => {
    setDraft(
      selectedRun?.result
        ? structuredClone(selectedRun.result as PaperOutline)
        : null,
    );
    setPreview(null);
    setConfirmed(false);
    setOutlineText("");
    setExportNotice("");
  }, [selectedRun?.id, resultKey]);
  useEffect(() => {
    setPreview(null);
    setConfirmed(false);
  }, [data?.inputDigest]);
  const cite = (sources: ReportCitation[]) =>
    sources
      .map(
        (c) =>
          `${data?.reports.find((r) => r.id === c.sourceId)?.name ?? c.sourceId.slice(0, 8)} · PDF p.${c.page} · ${c.section}`,
      )
      .join("; ");
  async function act(action: string, args: Record<string, unknown> = {}) {
    setError("");
    try {
      return await s.act(action, args);
    } catch (e) {
      setError(String(e));
      return undefined;
    }
  }
  async function importPdfs() {
    const token = ++importToken.current;
    setError("");
    try {
      const paths = await open({
        multiple: true,
        filters: [{ name: "Research reports", extensions: ["pdf"] }],
      });
      if (!paths) return;
      for (const path of typeof paths === "string" ? [paths] : paths) {
        if (token !== importToken.current) break;
        const name = path.split(/[\\/]/).slice(-1)[0] ?? "report.pdf";
        setProgress(`正在读取 ${name}`);
        const bytes = await readFile(path);
        if (token !== importToken.current) break;
        const pages = await extractReport(
          bytes,
          (page, total) => {
            if (token === importToken.current)
              setProgress(`${name}: ${page}/${total} 页`);
          },
          () => token !== importToken.current,
        );
        if (token !== importToken.current) break;
        await s.act("import", { name, bytes: Array.from(bytes), pages });
      }
    } catch (e) {
      if (token === importToken.current)
        setError(`PDF 未能完整导入：${String(e)}`);
    } finally {
      if (token === importToken.current) setProgress("");
    }
  }
  function editSection(index: number, key: string, value: unknown) {
    setDraft((d) =>
      d
        ? {
            ...d,
            sections: d.sections.map((s, i) =>
              i === index ? { ...s, [key]: value } : s,
            ),
          }
        : d,
    );
    setPreview(null);
    setConfirmed(false);
  }
  function editClaim(
    section: number,
    claim: number,
    key: keyof OutlineClaim,
    value: string | string[],
  ) {
    if (!draft) return;
    editSection(
      section,
      "claims",
      draft.sections[section].claims.map((c, i) =>
        i === claim ? { ...c, [key]: value } : c,
      ),
    );
  }
  const unsaved = draft && JSON.stringify(draft) !== resultKey;
  const inputsUnsaved =
    !!data &&
    (requirements !== data.requirements || mainline !== data.mainline);
  const structureUnsaved = (() => {
    if (!outlineText) return false;
    try {
      return (
        JSON.stringify(parseEditableOutline(outlineText)) !==
        JSON.stringify(draft)
      );
    } catch {
      return true;
    }
  })();
  async function exportPdf() {
    if (
      exportLock.current ||
      blocked ||
      unsaved ||
      inputsUnsaved ||
      structureUnsaved ||
      !selectedRun ||
      !data
    )
      return;
    exportLock.current = true;
    setExporting(true);
    setError("");
    setExportNotice("");
    const token = ++exportToken.current;
    const context = exportContext.current;
    const runId = selectedRun.id;
    const expectedHeads = [...data.storageHeads];
    const current = () =>
      token === exportToken.current && context === exportContext.current;
    try {
      const path = await save({
        title: `导出大纲为 PDF · ${runId.slice(0, 8)}`,
        defaultPath: `outline-${runId.slice(0, 8)}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!current()) return;
      if (!path) {
        setExportNotice("已取消导出，未创建文件。");
        return;
      }
      if (!/\.pdf$/i.test(path))
        throw new Error("请选择以 .pdf 结尾的文件名；未写入文件。");
      const result = await invoke<{
        runId: string;
        bytes: number[];
        warnings: string[];
      }>("planning_operation", {
        projectId: project,
        action: "exportPDF",
        args: { runId, expectedHeads },
      });
      if (!current()) return;
      if (
        result.runId !== runId ||
        !Array.isArray(result.bytes) ||
        result.bytes.length < 5 ||
        result.bytes
          .slice(0, 5)
          .map((c) => String.fromCharCode(c))
          .join("") !== "%PDF-"
      )
        throw new Error("导出结果与所选版本不符或 PDF 无效；未写入文件。");
      if (await exists(path)) {
        if (!current()) return;
        const overwrite = await ask(
          `文件已存在。是否用大纲版本 ${runId.slice(0, 8)} 的 PDF 覆盖它？`,
          { title: "确认覆盖大纲 PDF", kind: "warning" },
        );
        if (!current()) return;
        if (!overwrite) {
          setExportNotice("已取消覆盖，原文件保持不变。");
          return;
        }
      }
      if (!current()) return;
      setSavingPdf(true);
      await writeFile(path, new Uint8Array(result.bytes));
      if (current())
        setExportNotice(
          `已导出保存版本 ${runId.slice(0, 8)}。${result.warnings.join(" ")}`,
        );
    } catch (e) {
      if (current())
        setError(
          `大纲 PDF 导出失败：${String(e)}。可修正后重试；论文和大纲未修改。`,
        );
    } finally {
      if (token === exportToken.current) {
        exportLock.current = false;
        setExporting(false);
        setSavingPdf(false);
      }
    }
  }
  useEffect(() => {
    setPreview(null);
    setConfirmed(false);
  }, [requirements, mainline]);
  const alreadyApplied = data?.applied.some((a) => a.runId === selectedRun?.id);
  const oldOutline =
    outlines.length > 1
      ? (outlines[outlines.length - 2]?.result as PaperOutline)
      : undefined;
  return (
    <section
      aria-label="Research report outline planner"
      className={
        sidebar
          ? "space-y-3 rounded border p-3 text-xs"
          : "max-h-[60vh] space-y-3 overflow-y-auto rounded border p-3 text-xs"
      }
    >
      <p>
        研究报告 → 主线选择 → 英文详细大纲 →
        确认后创建标题骨架。不会自动生成论文正文或证明。
      </p>
      {(s.error || error) && (
        <p role="alert" className="text-destructive">
          {error || s.error}
        </p>
      )}
      {!data && (
        <button className={button} onClick={() => void s.load(project)}>
          重新读取报告工作流
        </button>
      )}
      {data?.storageStatus === "legacy" && (
        <p>请先用上方迁移按钮迁移本机大纲与审查记录，再导入报告。</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={blocked || data?.storageStatus === "legacy"}
          onClick={() => void importPdfs()}
        >
          导入 PDF 报告（可多选）
        </button>
        {progress && (
          <>
            <span role="status">{progress}</span>
            <button
              className={button}
              onClick={() => {
                importToken.current++;
                setProgress("");
              }}
            >
              取消导入后续步骤
            </button>
          </>
        )}
        {running && (
          <button
            className={button}
            disabled={s.busy}
            onClick={() => void act("cancel")}
          >
            取消大纲生成
          </button>
        )}
        <button
          className={button}
          disabled={s.busy}
          onClick={() => void s.load(project)}
        >
          刷新记录
        </button>
      </div>
      {data?.reports.map((report) => (
        <details key={report.id} className="rounded border p-2">
          <summary>
            {report.name} · {report.pages.length} 页 ·{" "}
            {report.pages.filter((p) => p.status === "readable").length}{" "}
            页有可读文本 · {report.id.slice(0, 8)}
          </summary>
          {report.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button
            className={button}
            disabled={blocked}
            onClick={() => void act("removeReport", { sourceId: report.id })}
          >
            从当前材料选择移除（保留历史与原件）
          </button>
          {report.pages.map((page) => (
            <details key={page.page}>
              <summary>
                PDF 第 {page.page} 页 · {page.status}
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                {page.text || "无可读文本；未执行 OCR。"}
              </pre>
            </details>
          ))}
        </details>
      ))}
      <label className="block">
        写作要求（可中文）
        <textarea
          aria-label="写作要求"
          className={field}
          rows={4}
          value={requirements}
          disabled={blocked}
          onChange={(e) => setRequirements(e.target.value)}
        />
      </label>
      <button
        className={button}
        disabled={blocked || !requirements.trim()}
        onClick={() => void act("requirements", { text: requirements })}
      >
        保存写作要求
      </button>
      <label className="block">
        <input
          type="checkbox"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
        />{" "}
        我已检查空白/失败页，同意只据可读材料提出受限大纲（不会声称读全）
      </label>
      <button
        className={button}
        disabled={
          blocked ||
          !data?.reports.length ||
          requirements !== data.requirements ||
          !requirements.trim()
        }
        onClick={() =>
          void act("startThemes", {
            allowPartial: partial,
            model: useAgentChatStore.getState().selectedModel,
            effort: useAgentChatStore.getState().effortLevel,
          })
        }
      >
        提出论文主线选项
      </button>
      {data?.options.map((option) => (
        <details key={option.id} className="rounded border p-2">
          <summary>{option.title}</summary>
          <p>{option.coreQuestion}</p>
          <p>可用结果：{option.usableResults.join(" · ")}</p>
          <p>取舍：{option.tradeoffs.join(" · ")}</p>
          <p>缺口：{option.gaps.join(" · ")}</p>
          <p>{cite(option.sources)}</p>
          <button
            className={button}
            disabled={blocked}
            onClick={() =>
              setMainline(
                `${option.title}\n${option.coreQuestion}\nScope: ${option.usableResults.join("; ")}\nTradeoffs: ${option.tradeoffs.join("; ")}\nOpen gaps: ${option.gaps.join("; ")}`,
              )
            }
          >
            选择并编辑这条主线
          </button>
        </details>
      ))}
      <label className="block">
        选择、修改或自定义主线
        <textarea
          aria-label="论文主线"
          className={field}
          rows={4}
          disabled={blocked}
          value={mainline}
          onChange={(e) => setMainline(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          className={button}
          disabled={blocked || !mainline.trim()}
          onClick={() => void act("mainline", { text: mainline })}
        >
          确认主线
        </button>
        <button
          className={button}
          disabled={
            blocked ||
            !data?.selectionConfirmed ||
            mainline !== data.mainline ||
            requirements !== data.requirements
          }
          onClick={() =>
            void act("startOutline", {
              allowPartial: partial,
              model: useAgentChatStore.getState().selectedModel,
              effort: useAgentChatStore.getState().effortLevel,
            })
          }
        >
          一次生成完整英文大纲
        </button>
      </div>
      {data?.runs.map((run) => (
        <details key={run.id} className="rounded border p-2">
          <summary>
            {run.kind === "themes"
              ? "主线建议"
              : run.kind === "macros"
                ? "宏定义建议"
                : "英文大纲"}{" "}
            · {run.state} · {run.createdAt}
            {run.kind === "outline" && run.inputDigest !== data.inputDigest
              ? " · 要求/材料/主线已变更"
              : ""}
          </summary>
          {(run as { origin?: string }).origin === "user_edit" && (
            <p>用户编辑版本；原生成版本保留。</p>
          )}
          {run.error && <p role="alert">{run.error}</p>}
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap">
            {run.raw}
          </pre>
        </details>
      ))}
      {outlines.length > 0 && (
        <label>
          大纲版本
          <select
            aria-label="大纲版本"
            disabled={exporting}
            className={field}
            value={selectedRun?.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {outlines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.createdAt} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft && selectedRun && (
        <div className="space-y-3">
          <h3 className="font-semibold">
            English outline (editable; novelty not assessed)
          </h3>
          <div className="space-y-2 rounded border p-2">
            <p>
              导出所选的已保存版本：{selectedRun.id.slice(0, 8)} ·{" "}
              {selectedRun.createdAt}。保存对话框会确认重名覆盖。
            </p>
            {(unsaved || inputsUnsaved || structureUnsaved) && (
              <p>
                存在未保存修改；请先保存大纲、写作要求或确认主线，再导出 PDF。
              </p>
            )}
            <button
              className={button}
              disabled={
                blocked || !!unsaved || inputsUnsaved || structureUnsaved
              }
              onClick={() => void exportPdf()}
            >
              导出大纲为 PDF
            </button>
            {exporting && (
              <button
                className={button}
                disabled={savingPdf}
                onClick={() => {
                  exportToken.current++;
                  exportLock.current = false;
                  setExporting(false);
                  setExportNotice("已取消导出，未创建文件。");
                }}
              >
                取消导出
              </button>
            )}
            {exporting && <p role="status">正在准备所选版本的 PDF…</p>}
            {exportNotice && <p role="status">{exportNotice}</p>}
          </div>
          <label>
            Paper title
            <input
              aria-label="英文论文标题"
              className={field}
              value={draft.title}
              disabled={blocked}
              onChange={(e) => {
                setDraft({ ...draft, title: e.target.value });
                setPreview(null);
              }}
            />
          </label>
          <p>{draft.mainline}</p>
          <details>
            <summary>与上一份大纲的主线/章节变化</summary>
            {compareOutlines(oldOutline, draft).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </details>
          {draft.sections.map((section, index) => (
            <details
              key={section.id}
              className={`rounded border p-2 ${section.level === "subsection" ? "ml-4" : ""}`}
            >
              <summary>
                {outlineLabels(draft.sections)[index]}. {section.title}
              </summary>
              <p className="text-muted-foreground text-xs">
                {section.level === "subsection"
                  ? `Subsection · parent: ${section.parentId}`
                  : "Section"}
              </p>
              <label>
                Section title
                <input
                  aria-label={`Section title ${index + 1}`}
                  className={field}
                  value={section.title}
                  disabled={blocked}
                  onChange={(e) => editSection(index, "title", e.target.value)}
                />
              </label>
              <label>
                Purpose
                <textarea
                  aria-label={`Purpose ${index + 1}`}
                  className={field}
                  value={section.purpose}
                  disabled={blocked}
                  onChange={(e) =>
                    editSection(index, "purpose", e.target.value)
                  }
                />
              </label>
              <p>Dependencies: {section.dependencies.join(", ") || "None"}</p>
              <p>Sources: {cite(section.sources)}</p>
              <label>
                Section proof roadmap
                <textarea
                  className={field}
                  rows={3}
                  disabled={blocked}
                  value={section.proofSteps.join("\n")}
                  onChange={(e) =>
                    editSection(
                      index,
                      "proofSteps",
                      e.target.value.split("\n").filter(Boolean),
                    )
                  }
                />
              </label>
              <label>
                Checks and open questions
                <textarea
                  className={field}
                  rows={3}
                  disabled={blocked}
                  value={section.openQuestions.join("\n")}
                  onChange={(e) =>
                    editSection(
                      index,
                      "openQuestions",
                      e.target.value.split("\n").filter(Boolean),
                    )
                  }
                />
              </label>
              {section.claims.map((claim, c) => (
                <div
                  key={`${section.id}-${c}`}
                  className="my-2 space-y-1 border-l-2 pl-2"
                >
                  <strong>
                    {claim.kind}: {claim.label}
                  </strong>
                  <label>
                    数学状态
                    <select
                      className={field}
                      value={claim.status}
                      disabled={blocked}
                      onChange={(e) =>
                        editClaim(index, c, "status", e.target.value)
                      }
                    >
                      {Object.entries(statuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    aria-label={`Proposed statement ${index + 1}.${c + 1}`}
                    className={field}
                    rows={3}
                    disabled={blocked}
                    value={claim.statement}
                    onChange={(e) =>
                      editClaim(index, c, "statement", e.target.value)
                    }
                  />
                  <label>
                    Proof steps
                    <textarea
                      className={field}
                      rows={3}
                      disabled={blocked}
                      value={claim.proofSteps.join("\n")}
                      onChange={(e) =>
                        editClaim(
                          index,
                          c,
                          "proofSteps",
                          e.target.value.split("\n").filter(Boolean),
                        )
                      }
                    />
                  </label>
                  <p>Dependencies: {claim.dependsOn.join("; ")}</p>
                  <p>Sources: {cite(claim.sources)}</p>
                  <p>Open checks: {claim.openQuestions.join("; ")}</p>
                </div>
              ))}
            </details>
          ))}
          {inputsUnsaved && (
            <p>
              写作要求或主线有未保存修改；先保存要求/确认主线，再生成新版本。
            </p>
          )}
          <p>Limitations: {draft.limitations.join(" · ")}</p>
          <details>
            <summary>完整结构编辑（依赖、来源、增删条目）</summary>
            <p>
              此处可编辑完整大纲结构；保存时检查英文、数学状态、来源页码及依赖。不会写入论文。
            </p>
            <textarea
              aria-label="完整大纲结构"
              className={field}
              rows={16}
              value={outlineText}
              onFocus={() => setOutlineText(JSON.stringify(draft, null, 2))}
              onChange={(e) => setOutlineText(e.target.value)}
              key={selectedRun.id + resultKey}
              disabled={blocked}
              onBlur={(e) => {
                try {
                  setDraft(parseEditableOutline(e.target.value));
                  setPreview(null);
                  setConfirmed(false);
                  setError("");
                } catch (error) {
                  setError(String(error));
                }
              }}
            />
          </details>
          <button
            className={button}
            disabled={blocked || !unsaved}
            onClick={() =>
              void act("editOutline", {
                runId: selectedRun.id,
                outline: draft,
              }).then((r) => {
                if (r) setSelected("");
              })
            }
          >
            保存大纲修改（保留版本历史）
          </button>
          <button
            className={button}
            disabled={
              blocked ||
              inputsUnsaved ||
              !!unsaved ||
              alreadyApplied ||
              selectedRun.inputDigest !== data?.inputDigest
            }
            onClick={() =>
              void act("preview", { runId: selectedRun.id }).then((r) => {
                if (r) {
                  setPreview(r as HeadingsPreview);
                  setConfirmed(false);
                }
              })
            }
          >
            预览标题骨架与导航变更
          </button>
          {preview && (
            <div className="space-y-2 rounded border p-2">
              <p>
                将新建 {preview.path}
                ，向大纲导航追加章节；已有正文不变，不自动插入 main.tex。
              </p>
              <pre className="overflow-auto whitespace-pre-wrap">
                {preview.latex}
              </pre>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                我已查看最新预览，确认只创建这些标题并追加导航
              </label>
              <button
                className={button}
                disabled={blocked || inputsUnsaved || !!unsaved || !confirmed}
                onClick={() =>
                  void act("apply", {
                    runId: preview.runId,
                    previewDigest: preview.previewDigest,
                    confirmed: true,
                  }).then(async (r) => {
                    if (r) {
                      setPreview(null);
                      setConfirmed(false);
                      await useDocumentStore.getState().refreshFiles();
                    }
                  })
                }
              >
                确认建立骨架与导航
              </button>
            </div>
          )}
        </div>
      )}
      {data && selectedRun && (
        <MacroProposals
          data={data}
          outlineRun={selectedRun.id}
          blocked={blocked || inputsUnsaved || !!unsaved}
          partial={partial}
        />
      )}
      {data?.applied.map((a) => (
        <p key={`${a.runId}-${a.macroRun ?? "headings"}`}>
          已确认骨架：{a.path}
          {a.macroPath ? ` · 宏区：${a.macroPath}` : ""}
        </p>
      ))}
    </section>
  );
}
