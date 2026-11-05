import { useProofPdfNavigation } from "@/lib/proof-pdf-links";
import { sourcePdfView, saveSourcePdfView } from "@/lib/source-pdf-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";
import { readProjectBytes } from "@/lib/tauri/fs";
import { getPdfArrayBuffer } from "@/lib/mupdf/pdf-data";
import { PdfViewer } from "./pdf-viewer";
import { PdfPreview } from "./pdf-preview";

const control =
  "rounded border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-40";
function SourcePdfReader({ active }: { active: boolean }) {
  const project = useDocumentStore((s) => s.projectId);
  const files = useDocumentStore((s) => s.files);
  const target = usePreviewStore((s) => s.sourceTarget);
  const proofTarget = useProofPdfNavigation((s) => s.target);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const proof =
    proofTarget?.fileId === target?.fileId &&
    proofTarget?.projectRoot === projectRoot
      ? proofTarget
      : null;
  const file =
    target?.project === project
      ? files.find((f) => f.id === target.fileId && f.type === "pdf")
      : undefined;
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const scroll = useRef<((p: number) => void) | null>(null);
  const zooms = useRef<Record<string, number>>({});
  const key = file ? `${project}:${file.id}` : "";
  const pageWidth = useRef(595);
  const initialPage = useRef(1);
  const currentPage = useRef(1);
  const restoringPage = useRef<number | null>(null);
  const changeScale = useCallback(
    (v: number) => {
      const next = Math.max(0.25, Math.min(4, v));
      zooms.current[key] = next;
      setScale(next);
      saveSourcePdfView(key, next, currentPage.current);
    },
    [key],
  );
  useEffect(() => {
    let cancelled = false;
    setBytes(null);
    setError("");
    setPages(0);
    setPage(1);
    const saved = sourcePdfView(key);
    initialPage.current = saved?.page ?? 1;
    currentPage.current = initialPage.current;
    restoringPage.current = initialPage.current;
    setPage(initialPage.current);
    if (saved) zooms.current[key] = saved.scale;
    setScale(zooms.current[key] ?? 1);
    if (file)
      void readProjectBytes(file.ref)
        .then((b) => {
          if (!cancelled) {
            setLoadedKey(key);
            setBytes(new Uint8Array(b));
          }
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        });
    return () => {
      cancelled = true;
    };
  }, [file?.ref.projectId, file?.ref.path, retry, key]);
  const data = useMemo(
    () =>
      proof
        ? getPdfArrayBuffer(proof.bytes)
        : bytes && loadedKey === key
          ? getPdfArrayBuffer(bytes)
          : null,
    [bytes, loadedKey, key, proof],
  );
  const fit = useCallback(
    (width: number) => {
      pageWidth.current = width;
      const available = wrapper.current?.clientWidth ?? 0;
      if (available > 0 && !zooms.current[key])
        changeScale((available - 32) / width);
    },
    [key, changeScale],
  );
  useEffect(() => {
    if (!active || !pages) return;
    const targetPage = Math.min(currentPage.current, pages);
    restoringPage.current = targetPage;
    setPage(targetPage);
    let releaseFrame = 0;
    const frame = requestAnimationFrame(() => {
      scroll.current?.(targetPage);
      releaseFrame = requestAnimationFrame(() => {
        restoringPage.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(releaseFrame);
    };
  }, [active, pages, key]);
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-muted text-foreground"
      role="region"
      aria-label="源 PDF 阅读器"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-background p-2">
        <span className="min-w-0 flex-1 truncate text-xs" title={file?.name}>
          {file?.name ?? "请从 Files 选择 PDF"}
        </span>
        <button
          className={control}
          disabled={page <= 1}
          onClick={() => scroll.current?.(page - 1)}
          aria-label="源 PDF 上一页"
        >
          上一页
        </button>
        <span className="text-xs" aria-live="polite">
          {page} / {pages || "–"}
        </span>
        <button
          className={control}
          disabled={page >= pages}
          onClick={() => scroll.current?.(page + 1)}
          aria-label="源 PDF 下一页"
        >
          下一页
        </button>
        <button
          className={control}
          disabled={!file}
          onClick={() => changeScale(scale / 1.2)}
          aria-label="缩小源 PDF"
        >
          −
        </button>
        <select
          aria-label="源 PDF 缩放"
          className={control}
          value={String(scale)}
          onChange={(e) => changeScale(Number(e.target.value))}
        >
          <option value={String(scale)}>{Math.round(scale * 100)}%</option>
          {[0.5, 0.75, 1, 1.25, 1.5, 2]
            .filter((v) => v !== scale)
            .map((v) => (
              <option key={v} value={v}>
                {v * 100}%
              </option>
            ))}
        </select>
        <button
          className={control}
          disabled={!file}
          onClick={() => changeScale(scale * 1.2)}
          aria-label="放大源 PDF"
        >
          +
        </button>
        <button
          className={control}
          disabled={!file}
          onClick={() => {
            const available = wrapper.current?.clientWidth ?? 0;
            if (available > 32)
              changeScale((available - 32) / pageWidth.current);
          }}
        >
          适应宽度
        </button>
      </div>
      <div ref={wrapper} className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <div role="alert" className="p-4 text-sm">
            无法读取 PDF：{error}
            <button className={control} onClick={() => setRetry((n) => n + 1)}>
              重新读取 PDF
            </button>
          </div>
        ) : data ? (
          <PdfViewer
            data={data}
            scale={scale}
            rootFileId={`source:${key}`}
            isActive={active}
            selectedRegion={proof ?? undefined}
            onScaleChange={changeScale}
            onFirstPageSize={fit}
            onLoadSuccess={(n) => {
              if (proof) currentPage.current = proof.page;
              setPages(n);
            }}
            onCurrentPageChange={(n) => {
              if (!active) return;
              if (restoringPage.current !== null && n !== restoringPage.current)
                return;
              restoringPage.current = null;
              setPage(n);
              currentPage.current = n;
              saveSourcePdfView(key, zooms.current[key] ?? scale, n);
            }}
            scrollToPageRef={scroll}
            onError={setError}
          />
        ) : (
          <p className="p-4 text-sm">
            {file
              ? "正在读取 PDF…"
              : "从左侧 Files 选择 PDF，在这里阅读；TeX 编辑位置不会改变。"}
          </p>
        )}
      </div>
    </div>
  );
}
export function PdfReadingPane() {
  const project = useDocumentStore((s) => s.projectId);
  const p = usePreviewStore();
  const source = p.sourceTarget?.project === project;
  const reading = source && p.readingMode === "source";
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      aria-label="PDF 阅读区"
    >
      <div
        className="flex shrink-0 flex-wrap gap-1 border-b p-1"
        role="group"
        aria-label="PDF 阅读目标"
      >
        <button
          className={control}
          aria-pressed={!reading}
          onClick={() => p.setReadingMode("compiled")}
        >
          编译预览
        </button>
        <button
          className={control}
          aria-pressed={!!reading}
          disabled={!source}
          onClick={() => p.setReadingMode("source")}
        >
          源 PDF：{source ? p.sourceTarget?.name : "未选择"}
        </button>
        <button
          className={`${control} ml-auto`}
          onClick={() => p.setVisible(false)}
          aria-label="收起 PDF 阅读区"
        >
          收起 PDF
        </button>
      </div>
      <div
        className="min-h-0 flex-1"
        style={{ display: reading ? "none" : "flex" }}
        aria-hidden={!!reading}
      >
        <div className="h-full min-h-0 w-full">
          <PdfPreview />
        </div>
      </div>
      <div
        className="min-h-0 flex-1"
        style={{ display: reading ? "flex" : "none" }}
        aria-hidden={!reading}
      >
        <div className="h-full min-h-0 w-full">
          <SourcePdfReader active={!!reading && p.visible} />
        </div>
      </div>
    </section>
  );
}
