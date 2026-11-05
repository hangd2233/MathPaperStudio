import { useEffect, useRef, useState, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invoke } from "@/lib/backend";
import { useDocumentStore } from "@/stores/document-store";
import { useManualStore } from "@/stores/manual-store";
import {
  emptyLibrary,
  insertSymbol,
  mathTemplates,
  previewLatex,
  searchTemplates,
  type InsertionMode,
  type MathTemplate,
  type SymbolLibrary,
} from "@/lib/math-symbols";

const button =
  "rounded border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted";
interface RecordData {
  symbols?: SymbolLibrary;
  storageHeads?: string[];
  storageStatus?: string;
}
export function MathSymbolPanel({
  editorView,
  enabled,
}: {
  editorView: RefObject<EditorView | null>;
  enabled: boolean;
}) {
  const project = useDocumentStore((s) => s.projectId);
  const file = useDocumentStore((s) => s.activeFileId);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部 All");
  const [library, setLibrary] = useState<SymbolLibrary>(emptyLibrary),
    [record, setRecord] = useState<RecordData | null>(null);
  const [selected, setSelected] = useState("fraction"),
    [mode, setMode] = useState<InsertionMode>("auto");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState<MathTemplate>({
    id: "",
    name: "",
    category: "自定义 Custom",
    keywords: "",
    latex: "",
    requires: "",
  });
  const locked = useRef(false);
  const consumed = useRef(false);
  const target = useRef<{
    view: EditorView;
    doc: EditorView["state"]["doc"];
    file: string | null;
  } | null>(null);
  const launch = () => {
    const view = editorView.current;
    if (!enabled || !view || view.state.readOnly || view.composing) return;
    target.current = { view, doc: view.state.doc, file };
    consumed.current = false;
    setOpen(true);
    setError("");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !e.isComposing &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m" &&
        editorView.current?.hasFocus &&
        !open
      ) {
        e.preventDefault();
        launch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    setOpen(false);
    target.current = null;
  }, [file, project]);
  useEffect(() => {
    if (!open || !project) return;
    let live = true;
    setRecord(null);
    invoke<RecordData>("manual_operation", {
      projectId: project,
      action: "get",
      args: {},
    })
      .then((d) => {
        if (live) {
          setRecord(d);
          setLibrary(d.symbols ?? emptyLibrary());
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [open, project]);
  const persist = async (next: SymbolLibrary) => {
    if (!project || !record || locked.current) return false;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      await invoke("manual_operation", {
        projectId: project,
        action: "save",
        args: { symbols: next, expectedHeads: record.storageHeads ?? [] },
      });
      const d = await invoke<RecordData>("manual_operation", {
        projectId: project,
        action: "get",
        args: {},
      });
      setRecord(d);
      setLibrary(d.symbols ?? emptyLibrary());
      await useManualStore.getState().load(project);
      return true;
    } catch (e) {
      setError(`符号库未保存：${String(e)}；请关闭后重开，保留并处理冲突。`);
      return false;
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };
  const all = [...mathTemplates, ...library.templates];
  const active = all.find((t) => t.id === selected) ?? all[0];
  const choices = searchTemplates(all, query).filter(
    (t) =>
      category === "全部 All" ||
      category === t.category ||
      (category === "收藏 Favorites" && library.favorites.includes(t.id)) ||
      (category === "最近 Recent" && library.recent.includes(t.id)),
  );
  if (category === "最近 Recent")
    choices.sort(
      (a, b) => library.recent.indexOf(a.id) - library.recent.indexOf(b.id),
    );
  const preview = (() => {
    try {
      return {
        html: katex.renderToString(previewLatex(active.latex), {
          throwOnError: true,
          trust: false,
          strict: "error",
          displayMode: true,
          maxExpand: 200,
          maxSize: 20,
        }),
      };
    } catch {
      return {
        error:
          "此源码无法用内置 KaTeX 预览；请检查源码与所需宏/包。预览不代表 LaTeX 编译成功。",
      };
    }
  })();
  const insert = () => {
    if (locked.current || consumed.current) return;
    const t = target.current,
      view = editorView.current;
    if (
      !enabled ||
      !t ||
      view !== t.view ||
      file !== t.file ||
      view.state.doc !== t.doc
    ) {
      setError("编辑目标已变化，请关闭并重新打开符号库。");
      return;
    }
    try {
      insertSymbol(view, active, mode);
      consumed.current = true;
      setOpen(false);
      void persist({
        ...library,
        recent: [
          active.id,
          ...library.recent.filter((id) => id !== active.id),
        ].slice(0, 30),
      });
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <button
        className={button}
        disabled={!enabled}
        title="数学符号库 · ⌘/Ctrl+Shift+M"
        onMouseDown={(e) => e.preventDefault()}
        onClick={launch}
      >
        Σ 符号库
      </button>
      {!open && error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-4xl"
          onEscapeKeyDown={(e) => {
            if (e.isComposing) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const t = target.current;
            if (t && editorView.current === t.view && file === t.file)
              t.view.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>LaTeX 数学符号库</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">
            搜索／预览不会改正文。明确插入才写入光标／选区，可一次撤销。⌘/Ctrl+Shift+M
            打开，Escape 取消。
          </p>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <input
              autoFocus
              aria-label="搜索数学符号"
              className="min-w-0 flex-1 rounded border p-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="中文 / English / \\frac"
            />
            <select
              aria-label="符号分类"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="max-w-[45%] rounded border p-2"
            >
              {[
                "全部 All",
                "收藏 Favorites",
                "最近 Recent",
                ...new Set(all.map((t) => t.category)),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid min-h-64 grid-cols-2 gap-4">
            <div
              className="max-h-64 space-y-1 overflow-y-auto"
              role="group"
              aria-label="符号列表"
            >
              {choices.map((t) => (
                <button
                  key={t.id}
                  className={`${button} block w-full text-left ${t.id === active.id ? "bg-muted font-semibold" : ""}`}
                  onClick={() => setSelected(t.id)}
                >
                  {library.favorites.includes(t.id) ? "★ " : ""}
                  {t.name}
                  <code className="block truncate text-muted-foreground">
                    {t.latex}
                  </code>
                </button>
              ))}
              {!choices.length && <p>无匹配符号</p>}
            </div>
            <div className="min-w-0 space-y-2">
              <strong>{active.name}</strong>
              <div
                className="min-h-20 overflow-x-auto rounded border p-2"
                role="group"
                aria-label="公式预览"
              >
                {preview.html ? (
                  <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                ) : (
                  <p className="text-xs">{preview.error}</p>
                )}
              </div>
              <pre
                className="whitespace-pre-wrap break-all border p-2 text-xs"
                role="region"
                aria-label="公式源码"
              >
                {active.latex}
              </pre>
              <p className="text-xs">
                所需宏／包：{active.requires || "用户未声明；使用前请核实"}
                。不会自动修改导言区。
              </p>
              <p className="text-xs">
                {
                  "{{名称}} 是占位：选区填入首项；插入后选中首项，其他项保留可编辑提示。"
                }
              </p>
              <button
                className={button}
                disabled={
                  !record || saving || record.storageStatus === "legacy"
                }
                onClick={() =>
                  void persist({
                    ...library,
                    favorites: library.favorites.includes(active.id)
                      ? library.favorites.filter((id) => id !== active.id)
                      : [...library.favorites, active.id],
                  })
                }
              >
                {library.favorites.includes(active.id) ? "取消收藏" : "收藏"}
              </button>
              {active.id.startsWith("custom-") && (
                <button
                  className={button}
                  disabled={saving}
                  onClick={() => {
                    setCustom({ ...active });
                    setEditing(true);
                  }}
                >
                  编辑模板
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label>
              插入方式{" "}
              <select
                aria-label="公式插入方式"
                className="rounded border p-1"
                value={mode}
                onChange={(e) => setMode(e.target.value as InsertionMode)}
              >
                <option value="auto">自动：数学模式内用源码，外部用 $…$</option>
                <option value="raw">原始源码（不加定界符）</option>
                <option value="inline">行内 $…$（已有数学模式不重复）</option>
                <option value="display">独立公式（已有数学模式不重复）</option>
              </select>
            </label>
            <button
              className={button}
              disabled={!enabled || saving || !record}
              onClick={insert}
            >
              插入所选公式
            </button>
            <button className={button} onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            自动识别常用 $、\\(、\\[ 和 equation/align
            等环境；自定义宏、复杂嵌套及数学内文本请手选原始源码并检查。自定义库、收藏和最近使用随项目
            .mps 保存；旧本机记录需先迁移。
          </p>
          <button
            className={button}
            disabled={!record || saving || record.storageStatus === "legacy"}
            onClick={() => {
              setCustom({
                id: `custom-${crypto.randomUUID()}`,
                name: "",
                category: "自定义 Custom",
                keywords: "",
                latex: "",
                requires: "",
              });
              setEditing(true);
            }}
          >
            新建命名模板
          </button>
          {editing && (
            <fieldset className="space-y-2 rounded border p-3">
              <legend>自定义模板（只保存源码，不执行）</legend>
              {(
                [
                  ["name", "模板名称"],
                  ["keywords", "中英文关键词"],
                  ["latex", "模板 LaTeX 源码"],
                  ["requires", "所需宏或包（可写 LaTeX core）"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs">
                  {label}
                  <textarea
                    aria-label={label}
                    className="block w-full rounded border p-1"
                    value={custom[key]}
                    maxLength={
                      key === "latex" ? 8000 : key === "name" ? 200 : 1000
                    }
                    onChange={(e) =>
                      setCustom({ ...custom, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button
                className={button}
                disabled={
                  saving ||
                  !custom.name.trim() ||
                  !custom.latex.trim() ||
                  !custom.requires.trim()
                }
                onClick={async () => {
                  const next = {
                    ...library,
                    templates: [
                      ...library.templates.filter((t) => t.id !== custom.id),
                      custom,
                    ],
                  };
                  if (await persist(next)) {
                    setSelected(custom.id);
                    setEditing(false);
                    setQuery("");
                    setCategory("自定义 Custom");
                  }
                }}
              >
                保存命名模板
              </button>
              <button className={button} onClick={() => setEditing(false)}>
                取消模板编辑
              </button>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
