import { create } from "zustand";
import { invoke } from "@/lib/backend";

export interface OutlineItem {
  parentId?: string;
  id: string;
  title: string;
  kind: string;
  status: string;
  path: string;
  line: number;
}
export interface ManualReview {
  id: string;
  kind: string;
  revision: string;
  sources: Record<string, string>;
  state: string;
  createdAt: string;
  raw?: string;
  error?: string;
  result?: {
    outcome: string;
    findings: { path: string; line: number; issue: string; repair: string }[];
    limitations: string;
  };
}
export interface ManualData {
  mode: "agent" | "manual";
  outline: OutlineItem[];
  reviews: ManualReview[];
  currentRevision?: string;
  storageStatus?: "new" | "legacy" | "portable" | "conflict";
  storageHeads?: string[];
  stableProjectId?: string;
  legacyDigest?: string;
  storageChoices?: { id: string; createdAt: string; data: ManualData }[];
}
interface State {
  project: string | null;
  data: ManualData | null;
  busy: boolean;
  error: string;
  load(id: string): Promise<void>;
  act(action: string, args?: unknown): Promise<void>;
}
export const useManualStore = create<State>((set, get) => ({
  project: null,
  data: null,
  busy: false,
  error: "",
  async load(id) {
    if (get().project !== id)
      set({ project: id, data: null, error: "", busy: false });
    try {
      const data = await invoke<ManualData>("manual_operation", {
        projectId: id,
        action: "get",
        args: {},
      });
      if (get().project === id) set({ data, error: "" });
    } catch (e) {
      if (get().project === id) set({ error: String(e), data: null });
    }
  },
  async act(action, args = {}) {
    const { project, busy } = get();
    if (!project || busy) return;
    set({ busy: true, error: "" });
    try {
      const data = get().data;
      const guardedArgs = { ...(args as Record<string, unknown>) };
      if (
        (action === "save" || action === "resolveStorage") &&
        data?.storageHeads
      )
        guardedArgs.expectedHeads = data.storageHeads;
      if (action === "migrate" && data?.legacyDigest)
        guardedArgs.legacyDigest = data.legacyDigest;
      await invoke("manual_operation", {
        projectId: project,
        action,
        args: guardedArgs,
      });
      if (get().project === project) await get().load(project);
    } catch (e) {
      if (get().project === project) set({ error: String(e) });
    } finally {
      if (get().project === project) set({ busy: false });
    }
  },
}));
