import { create } from "zustand";
import { invoke } from "@/lib/backend";
import type { PlanningData } from "@/lib/report-planning";
import { useManualStore } from "@/stores/manual-store";

interface State {
  project: string | null;
  data: PlanningData | null;
  busy: boolean;
  error: string;
  load(id: string): Promise<void>;
  act(action: string, args?: Record<string, unknown>): Promise<unknown>;
}
export const usePlanningStore = create<State>((set, get) => ({
  project: null,
  data: null,
  busy: false,
  error: "",
  async load(id) {
    if (get().project !== id)
      set({ project: id, data: null, error: "", busy: false });
    try {
      const data = await invoke<PlanningData>("planning_operation", {
        projectId: id,
        action: "get",
        args: {},
      });
      if (get().project === id) set({ data, error: "" });
    } catch (e) {
      if (get().project === id) set({ data: null, error: String(e) });
    }
  },
  async act(action, args = {}) {
    const { project, data, busy } = get();
    if (!project || busy) return;
    set({ busy: true, error: "" });
    try {
      const result = await invoke("planning_operation", {
        projectId: project,
        action,
        args: { ...args, expectedHeads: data?.storageHeads ?? [] },
      });
      if (get().project === project && action !== "preview") {
        await get().load(project);
        await useManualStore.getState().load(project);
      }
      return result;
    } catch (error) {
      if (get().project === project) set({ error: String(error) });
      throw error;
    } finally {
      if (get().project === project) set({ busy: false });
    }
  },
}));
