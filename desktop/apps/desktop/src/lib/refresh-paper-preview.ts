import { useDocumentStore, getCurrentPdfRootId } from "@/stores/document-store";
import { compileLatex, resolveCompileTarget, formatCompileError } from "@/lib/latex-compiler";
import { useProofPdfNavigation } from "@/lib/proof-pdf-links";
import { usePreviewStore } from "@/stores/preview-store";

// Agent writes have finished; reuse the existing compiler, independently of Keep/Undo.
export async function refreshPaperPreview(projectId: string, stillIdle: () => boolean) {
  const valid = () => useDocumentStore.getState().projectId === projectId && stillIdle();
  while (valid() && useDocumentStore.getState().isCompiling) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!valid()) return;
  const doc = useDocumentStore.getState();
  const main = doc.files.find(f => f.relativePath === "main.tex");
  const target = resolveCompileTarget(main?.id ?? getCurrentPdfRootId() ?? doc.activeFileId, doc.files);
  if (!target || !doc.projectRoot) return;
  // Never label a PDF built from disk as the current unsaved editor revision.
  if (doc.files.some(file => file.isDirty)) return;
  const generation = doc.contentGeneration;
  const idleRevision = () => valid() && useDocumentStore.getState().contentGeneration === generation;
  doc.setIsCompiling(true);
  try {
    const bytes = await compileLatex(doc.projectRoot, target.targetPath);
    if (!idleRevision()) return;
    doc.setPdfData(bytes, target.rootId);
    // Recompile in the existing live viewer. A linked fixed PDF is only for
    // explicit proof-map navigation; never create one for an ordinary refresh.
    const previous = useProofPdfNavigation.getState().target;
    if (previous?.projectRoot === doc.projectRoot) {
      useProofPdfNavigation.setState({ target: null });
    }
    usePreviewStore.getState().setVisible(true);
  } catch (error) {
    if (idleRevision()) doc.setCompileError(formatCompileError(error), target.rootId);
  } finally {
    if (useDocumentStore.getState().projectId === projectId) doc.setIsCompiling(false);
  }
}
