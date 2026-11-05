import { beforeEach, expect, it } from "vitest";
import { usePreviewStore } from "@/stores/preview-store";
import { sourcePdfView, saveSourcePdfView } from "@/lib/source-pdf-view";
beforeEach(() => {
  localStorage.clear();
  usePreviewStore.setState({
    visible: true,
    editorVisible: true,
    toolsVisible: true,
    sourceTarget: null,
    readingMode: "compiled",
  });
});
it("persists independent pane preferences and never hides both authoring and reading", async () => {
  const p = usePreviewStore.getState();
  p.setToolsVisible(false);
  p.setVisible(false);
  expect(usePreviewStore.getState().editorVisible).toBe(true);
  const saved = localStorage.getItem("mps-workspace-layout-v1")!;
  usePreviewStore.setState({ visible: true, toolsVisible: true });
  localStorage.setItem("mps-workspace-layout-v1", saved);
  await usePreviewStore.persist.rehydrate();
  expect(usePreviewStore.getState().visible).toBe(false);
  expect(usePreviewStore.getState().toolsVisible).toBe(false);
});
it("opening PDFs expands right pane; explicit compiled selection and current source are separate", () => {
  const p = usePreviewStore.getState();
  p.setVisible(false);
  p.openSource({ project: "p", fileId: "report.pdf", name: "report.pdf" });
  expect(usePreviewStore.getState().visible).toBe(true);
  p.setReadingMode("compiled");
  expect(usePreviewStore.getState().sourceTarget?.fileId).toBe("report.pdf");
  p.setReadingMode("source");
  expect(usePreviewStore.getState().readingMode).toBe("source");
});
it("validates and restores per-document page and zoom without absolute paths", () => {
  expect(sourcePdfView("p:one")).toBeNull();
  saveSourcePdfView("p:one", 1.25, 7);
  saveSourcePdfView("p:two", 0.75, 2);
  expect(sourcePdfView("p:one")).toEqual({ scale: 1.25, page: 7 });
  expect(sourcePdfView("p:two")?.page).toBe(2);
  localStorage.setItem("mps-source-pdf:p:one", '{"scale":900,"page":-4}');
  expect(sourcePdfView("p:one")).toBeNull();
});
