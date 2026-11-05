import { useDocumentStore } from "@/stores/document-store";
import { useRef, useState } from "react";
import { PdfViewer } from "./pdf-viewer";
import { getPdfArrayBuffer } from "@/lib/mupdf/pdf-data";
import { useProofPdfNavigation } from "@/lib/proof-pdf-links";

export function ProofLinkedPdf({ target }: { target: NonNullable<ReturnType<typeof useProofPdfNavigation.getState>["target"]> }) {
  const compileError = useDocumentStore(s => s.compileError);
  const compiling = useDocumentStore(s => s.isCompiling);
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(target.page);
  return <div ref={container} className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center justify-between gap-2 border-b p-2 text-xs">
      <span className="truncate" title={target.path}>{target.path.endsWith(".tex") ? "Updated paper PDF" : "Linked paper PDF"} · Page {page} · {target.path}</span>
      <button className="shrink-0 underline" onClick={() => useProofPdfNavigation.setState({ target: null })}>Return to live preview</button>
    </div>
    {compiling && <p role="status" className="p-2 text-xs">Updating paper PDF…</p>}
    {compileError && <p role="alert" className="p-2 text-xs text-destructive">PDF update failed: {compileError}</p>}
    <PdfViewer data={getPdfArrayBuffer(target.bytes)} scale={scale} onScaleChange={setScale}
      selectedRegion={ready ? target : undefined} onCurrentPageChange={setPage}
      onFirstPageSize={width => {
        if (ready) return;
        setScale(Math.max(0.25, Math.min(4, ((container.current?.clientWidth ?? width) - 32) / width)));
        setReady(true);
      }} />
  </div>;
}
