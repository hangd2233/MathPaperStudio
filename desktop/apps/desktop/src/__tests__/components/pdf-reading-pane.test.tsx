import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  doc: {
    projectId: "p",
    projectRoot: "/paper",
    files: [
      {
        id: "a.pdf",
        name: "a.pdf",
        type: "pdf",
        ref: { projectId: "p", path: "a.pdf" },
      },
      {
        id: "b.pdf",
        name: "b.pdf",
        type: "pdf",
        ref: { projectId: "p", path: "b.pdf" },
      },
    ],
  },
  read: vi.fn(),
  compiledMounts: 0,
  viewer: null as any,
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (selector: any) => selector(m.doc),
}));
vi.mock("@/lib/tauri/fs", () => ({ readProjectBytes: m.read }));
vi.mock("@/lib/proof-pdf-links", () => ({
  useProofPdfNavigation: (selector: any) => selector({ target: null }),
}));
vi.mock("@/lib/mupdf/pdf-data", () => ({
  getPdfArrayBuffer: (bytes: Uint8Array) => bytes.buffer,
}));
vi.mock("@/components/workspace/preview/pdf-viewer", () => ({
  PdfViewer: (props: any) => {
    m.viewer = props;
    props.scrollToPageRef.current = (page: number) =>
      props.onCurrentPageChange(page);
    return <p data-testid="source-data">PDF-{new Uint8Array(props.data)[0]}</p>;
  },
}));
vi.mock("@/components/workspace/preview/pdf-preview", () => ({
  PdfPreview: () => {
    return <p data-testid="compiled-preview">Compiled preview</p>;
  },
}));
import { PdfReadingPane } from "@/components/workspace/preview/pdf-reading-pane";
import { usePreviewStore } from "@/stores/preview-store";
let el: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  m.doc.projectId = "p";
  localStorage.clear();
  usePreviewStore.setState({
    visible: true,
    sourceTarget: null,
    readingMode: "compiled",
  });
  m.read.mockResolvedValue(new Uint8Array([1]));
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("keeps the compiled preview mounted while switching source reading modes", async () => {
  await act(async () => root.render(<PdfReadingPane />));
  const compiled = el.querySelector('[data-testid="compiled-preview"]');
  await act(async () =>
    usePreviewStore
      .getState()
      .openSource({ project: "p", fileId: "a.pdf", name: "a.pdf" }),
  );
  expect(el.textContent).toContain("PDF-1");
  expect(el.querySelector('[data-testid="compiled-preview"]')).toBe(compiled);
  await act(async () => usePreviewStore.getState().setReadingMode("compiled"));
  expect(el.querySelector('[data-testid="compiled-preview"]')).toBe(compiled);
  await act(async () => usePreviewStore.getState().setReadingMode("source"));
  expect(el.textContent).toContain("PDF-1");
  expect(m.read).toHaveBeenCalledOnce();
});
it("late PDF reads cannot replace a newer selected file", async () => {
  let finishA!: (v: Uint8Array) => void;
  m.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        }),
    )
    .mockResolvedValueOnce(new Uint8Array([2]));
  await act(async () => {
    usePreviewStore
      .getState()
      .openSource({ project: "p", fileId: "a.pdf", name: "a.pdf" });
    root.render(<PdfReadingPane />);
  });
  await act(async () =>
    usePreviewStore
      .getState()
      .openSource({ project: "p", fileId: "b.pdf", name: "b.pdf" }),
  );
  expect(el.textContent).toContain("PDF-2");
  await act(async () => finishA(new Uint8Array([1])));
  expect(el.textContent).toContain("PDF-2");
  expect(el.textContent).not.toContain("PDF-1");
});
it("switching projects never exposes another project's source PDF", async () => {
  await act(async () => {
    usePreviewStore
      .getState()
      .openSource({ project: "p", fileId: "a.pdf", name: "a.pdf" });
    root.render(<PdfReadingPane />);
  });
  m.doc.projectId = "other";
  await act(async () => root.render(<PdfReadingPane />));
  expect(el.querySelector('[data-testid="source-data"]')).toBeNull();
  expect(el.textContent).toContain("未选择");
});
it("read failure is recoverable without touching the author document", async () => {
  m.read.mockRejectedValueOnce(new Error("missing PDF"));
  await act(async () => {
    usePreviewStore
      .getState()
      .openSource({ project: "p", fileId: "a.pdf", name: "a.pdf" });
    root.render(<PdfReadingPane />);
  });
  expect(el.textContent).toContain("missing PDF");
  await act(async () =>
    Array.from(el.querySelectorAll("button"))
      .find((b) => b.textContent === "重新读取 PDF")!
      .click(),
  );
  expect(el.textContent).toContain("PDF-1");
});

it("hidden initialization cannot overwrite a saved page; expanding restores it", async () => {
  localStorage.setItem(
    "mps-source-pdf:p:a.pdf",
    JSON.stringify({ scale: 0.75, page: 5 }),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  try {
    await act(async () => {
      usePreviewStore.setState({
        visible: false,
        readingMode: "source",
        sourceTarget: { project: "p", fileId: "a.pdf", name: "a.pdf" },
      });
      root.render(<PdfReadingPane />);
    });
    await act(async () => {
      m.viewer.onLoadSuccess(46);
      m.viewer.onCurrentPageChange(1);
    });
    expect(
      JSON.parse(localStorage.getItem("mps-source-pdf:p:a.pdf")!).page,
    ).toBe(5);
    await act(async () => usePreviewStore.getState().setVisible(true));
    expect(el.textContent).toContain("5 / 46");
    expect(
      JSON.parse(localStorage.getItem("mps-source-pdf:p:a.pdf")!).page,
    ).toBe(5);
    await act(async () => m.viewer.onCurrentPageChange(6));
    expect(el.textContent).toContain("6 / 46");
    expect(
      JSON.parse(localStorage.getItem("mps-source-pdf:p:a.pdf")!).page,
    ).toBe(6);
  } finally {
    vi.unstubAllGlobals();
  }
});
