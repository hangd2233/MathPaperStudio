import { migrateStorageKey } from "@/lib/legacy-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  autoRecompile: boolean;
  setAutoRecompile: (enabled: boolean) => void;
  visualChangeReports: boolean;
  setVisualChangeReports: (enabled: boolean) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
  diagnosticUnderlines: boolean;
  setDiagnosticUnderlines: (visible: boolean) => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoRecompile: false,
      setAutoRecompile: (enabled) => set({ autoRecompile: enabled }),
      visualChangeReports: false,
      setVisualChangeReports: (enabled) =>
        set({ visualChangeReports: enabled }),
      vimMode: false,
      setVimMode: (enabled) => set({ vimMode: enabled }),
      diagnosticUnderlines: false,
      setDiagnosticUnderlines: (visible) =>
        set({ diagnosticUnderlines: visible }),
      editorFontSize: 14,
      setEditorFontSize: (size) =>
        set({ editorFontSize: normalizeFontSize(size) }),
    }),
    {
      name: migrateStorageKey("codex-prism-settings"),
      version: 1,
      migrate: (persisted) => settingsPreferences(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...settingsPreferences(persisted),
      }),
      partialize: ({
        autoRecompile,
        visualChangeReports,
        vimMode,
        editorFontSize,
        diagnosticUnderlines,
      }) => ({
        autoRecompile,
        visualChangeReports,
        vimMode,
        editorFontSize,
        diagnosticUnderlines,
      }),
    },
  ),
);

function normalizeFontSize(size: unknown): number {
  return typeof size === "number" && Number.isFinite(size)
    ? Math.max(10, Math.min(32, Math.round(size)))
    : 14;
}

/** Whitelist preferences so removed backend fields cannot return through hydration. */
export function settingsPreferences(value: unknown) {
  const state = (value ?? {}) as Record<string, unknown>;
  return {
    autoRecompile: state.autoRecompile === true,
    visualChangeReports: state.visualChangeReports === true,
    vimMode: state.vimMode === true,
    editorFontSize: normalizeFontSize(state.editorFontSize),
    diagnosticUnderlines: state.diagnosticUnderlines === true,
  };
}
