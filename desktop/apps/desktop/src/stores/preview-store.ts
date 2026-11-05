import { create } from "zustand";
import { persist } from "zustand/middleware";

type SourceTarget = { project: string; fileId: string; name: string };
interface PreviewState {
  visible: boolean;
  editorVisible: boolean;
  toolsVisible: boolean;
  sourceTarget: SourceTarget | null;
  readingMode: "compiled" | "source";
  setEditorVisible: (v: boolean) => void;
  setToolsVisible: (v: boolean) => void;
  toggle: () => void;
  setVisible: (v: boolean) => void;
  openSource: (source: SourceTarget) => void;
  setReadingMode: (mode: "compiled" | "source") => void;
}
export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      visible: true,
      editorVisible: true,
      toolsVisible: true,
      sourceTarget: null,
      readingMode: "compiled",
      setEditorVisible: (editorVisible) => set({ editorVisible }),
      setToolsVisible: (toolsVisible) => set({ toolsVisible }),
      toggle: () =>
        set((s) => ({
          visible: !s.visible,
          ...(!s.visible ? {} : { editorVisible: true }),
        })),
      setVisible: (visible) =>
        set((s) => ({
          visible,
          ...(!visible && !s.editorVisible ? { editorVisible: true } : {}),
        })),
      openSource: (sourceTarget) =>
        set({ sourceTarget, readingMode: "source", visible: true }),
      setReadingMode: (readingMode) => set({ readingMode }),
    }),
    {
      name: "mps-workspace-layout-v1",
      partialize: (s) => ({
        visible: s.visible,
        editorVisible: s.editorVisible,
        toolsVisible: s.toolsVisible,
        sourceTarget: s.sourceTarget,
        readingMode: s.readingMode,
      }),
    },
  ),
);
