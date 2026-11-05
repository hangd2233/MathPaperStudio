import { useEffect, useState } from "react";
import { usePlanningStore } from "@/stores/planning-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import type { PlanningData, ReportCitation } from "@/lib/report-planning";
export interface MacroItem {
  command: string;
  kind: "newcommand" | "operator";
  arity: number;
  body: string;
  usage: string;
  meaning: string;
  sourceNotation: string;
  sources: ReportCitation[];
  packages: string[];
  notes: string;
  selected: boolean;
  provenance: "proposed_macro";
}
export interface MacroList {
  items: MacroItem[];
  limitations: string[];
}
const btn = "rounded border px-2 py-1 text-xs disabled:opacity-40";
const definition = (m: MacroItem) =>
  m.kind === "operator"
    ? `\\DeclareMathOperator{\\${m.command}}{${m.body}}`
    : `\\newcommand{\\${m.command}}[${m.arity}]{${m.body}}`;
export function MacroProposals({
  data,
  outlineRun,
  blocked,
  partial,
}: {
  data: PlanningData;
  outlineRun: string;
  blocked: boolean;
  partial: boolean;
}) {
  const s = usePlanningStore();
  const [selected, setSelected] = useState("");
  const runs = data.runs.filter(
    (r) =>
      r.kind === "macros" &&
      r.outlineRun === outlineRun &&
      r.state === "completed",
  );
  const run = runs.find((r) => r.id === selected) ?? runs[runs.length - 1];
  const [draft, setDraft] = useState<MacroList | null>(null),
    [preview, setPreview] = useState<any>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const key = JSON.stringify(run?.result);
  useEffect(() => {
    setDraft(run?.result ? structuredClone(run.result as MacroList) : null);
    setPreview(null);
    setConfirmed(false);
  }, [run?.id, key, data.inputDigest]);
  const unsaved = JSON.stringify(draft) !== key;
  const stale = run?.inputDigest !== data.inputDigest;
  const applied = data.applied.some((a) => a.macroRun === run?.id);
  const update = (index: number, value: Partial<MacroItem>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((m, i) => (i === index ? { ...m, ...value } : m)),
    });
    setPreview(null);
    setConfirmed(false);
  };
  const act = async (action: string, args: Record<string, unknown>) => {
    setError("");
    try {
      return await s.act(action, args);
    } catch (e) {
      setError(String(e));
      return undefined;
    }
  };
  const cite = (cs: ReportCitation[]) =>
    cs
      .map(
        (c) =>
          `${data.reports.find((r) => r.id === c.sourceId)?.name ?? c.sourceId} · PDF p.${c.page} · ${c.section}`,
      )
      .join("; ");
  return (
    <section
      className="space-y-3 border-t pt-3"
      aria-label="材料来源的自定义公式区"
    >
      <h3 className="font-semibold">
        自定义公式／宏定义区（随新 TeX 骨架生成）
      </h3>
      <p className="text-xs">
        根据报告与已选主线建议精简宏。命令名是建议，不是源 PDF
        内部宏；先编辑、勾选并保存审核版本，再预览确认。审核前不改正文或导言区。
      </p>
      <button
        className={btn}
        disabled={blocked}
        onClick={() => {
          const a = useAgentChatStore.getState();
          void act("startMacros", {
            outlineRun,
            allowPartial: partial,
            model: a.selectedModel,
            effort: a.effortLevel,
          });
        }}
      >
        根据材料建议自定义公式清单
      </button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      {runs.length > 0 && (
        <label className="block text-xs">
          宏清单版本{" "}
          <select
            aria-label="宏清单版本"
            value={run?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.createdAt} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft && run && (
        <>
          <p className="text-xs">
            {stale
              ? "材料／主线已变更，清单已过期；请重新建议。"
              : "来源页码不等于数学正确性；建议仍需作者核对。"}
          </p>
          {draft.items.map((m, i) => (
            <details key={i} className="rounded border p-2">
              <summary>
                {m.selected ? "☑ " : "☐ "}\\{m.command} · {m.meaning}
              </summary>
              <div className="space-y-2 py-2 text-xs">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`采用宏 ${i + 1}`}
                    checked={m.selected}
                    disabled={blocked}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                  />
                  采用此定义
                </label>
                {(
                  [
                    ["command", "建议命令名（无反斜线）"],
                    ["body", "替换表达式"],
                    ["usage", "使用示例"],
                    ["meaning", "数学含义"],
                    ["sourceNotation", "材料中的可见记号"],
                    ["notes", "不确定性／取舍"],
                  ] as const
                ).map(([k, label]) => (
                  <label className="block" key={k}>
                    {label}
                    <textarea
                      className="block w-full rounded border p-1"
                      aria-label={`${label} ${i + 1}`}
                      value={m[k]}
                      disabled={blocked}
                      onChange={(e) => update(i, { [k]: e.target.value })}
                    />
                  </label>
                ))}
                <label>
                  定义方式{" "}
                  <select
                    aria-label={`定义方式 ${i + 1}`}
                    value={m.kind}
                    disabled={blocked}
                    onChange={(e) =>
                      update(i, {
                        kind: e.target.value as MacroItem["kind"],
                        arity: e.target.value === "operator" ? 0 : m.arity,
                      })
                    }
                  >
                    <option value="newcommand">newcommand</option>
                    <option value="operator">DeclareMathOperator</option>
                  </select>
                </label>
                <label>
                  {" "}
                  参数数目{" "}
                  <input
                    type="number"
                    aria-label={`参数数目 ${i + 1}`}
                    min={0}
                    max={4}
                    value={m.arity}
                    disabled={blocked || m.kind === "operator"}
                    onChange={(e) =>
                      update(i, { arity: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  所需宏包（逗号分隔）
                  <input
                    className="rounded border p-1"
                    aria-label={`宏包依赖 ${i + 1}`}
                    value={m.packages.join(",")}
                    disabled={blocked}
                    onChange={(e) =>
                      update(i, {
                        packages: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <pre className="whitespace-pre-wrap">{definition(m)}</pre>
                <p>来源：{cite(m.sources)}</p>
                <p>身份：建议定义（原始模型建议和作者修改版本均保留）</p>
              </div>
            </details>
          ))}
          <p className="text-xs">{draft.limitations.join(" · ")}</p>
          <button
            className={btn}
            disabled={blocked || !unsaved}
            onClick={() =>
              void act("editMacros", { runId: run.id, macros: draft }).then(
                (r) => {
                  if (r) setSelected("");
                },
              )
            }
          >
            保存宏清单审核版本
          </button>
          <button
            className={btn}
            disabled={blocked || unsaved || stale || applied}
            onClick={() =>
              void act("previewMacros", {
                runId: outlineRun,
                macroRun: run.id,
              }).then((r) => {
                if (r) {
                  setPreview(r);
                  setConfirmed(false);
                }
              })
            }
          >
            检查冲突并预览宏定义与新 TeX
          </button>
          {unsaved && (
            <button
              className={btn}
              disabled={blocked}
              onClick={() => {
                setDraft(structuredClone(run.result as MacroList));
                setPreview(null);
                setConfirmed(false);
              }}
            >
              放弃未保存宏修改
            </button>
          )}
          {preview && (
            <div className="space-y-2 rounded border p-2 text-xs">
              <button
                className={btn}
                onClick={() => {
                  setPreview(null);
                  setConfirmed(false);
                }}
              >
                取消本次宏预览
              </button>
              <p>
                只新建 {preview.macroPath} 和 {preview.path}。新 TeX
                在导言区引用该宏文件并声明依赖；已有正文、自定义宏和宏包设置均不改动。
              </p>
              <p>依赖：{preview.packages.join(", ") || "LaTeX core"}</p>
              <pre className="overflow-auto whitespace-pre-wrap">
                {preview.macroSource}
              </pre>
              <pre className="overflow-auto whitespace-pre-wrap">
                {preview.latex}
              </pre>
              <p>{preview.warnings.join(" · ")}</p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已审核所选宏、来源、依赖与新文件，确认生成
              </label>
              <button
                className={btn}
                disabled={blocked || unsaved || !confirmed}
                onClick={() =>
                  void act("applyMacros", {
                    runId: outlineRun,
                    macroRun: run.id,
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
                确认生成宏区与 TeX 骨架
              </button>
            </div>
          )}
          {applied && (
            <p className="text-xs">
              此宏版本已确认生成；重复确认已禁用。修改后保存新版本可另建文件。
            </p>
          )}
        </>
      )}
    </section>
  );
}
