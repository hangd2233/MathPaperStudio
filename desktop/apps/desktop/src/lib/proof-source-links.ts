import { useDocumentStore } from "@/stores/document-store";
import { openProjectFile } from "@/lib/project-file-links";

// Portable links are interpreted only inside the current project, never by the OS.
export function sourceTarget(href: string, files: { id: string; relativePath: string; content?: string }[]) {
  const url = new URL(href);
  if (url.protocol !== "prism-source:" || url.hostname !== "open") throw new Error("Unsupported source link");
  const path = url.searchParams.get("file") ?? "";
  if (!path.endsWith(".tex") || path.startsWith("/") || /[:\\]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid source path");
  const candidates = files.filter(f => f.relativePath === path || f.relativePath.endsWith("/" + path));
  if (candidates.length !== 1) throw new Error("Source file missing or ambiguous; open the intended paper project");
  const file = candidates[0];
  const content = file.content;
  if (content === undefined) throw new Error("Source content is not loaded");
  const label = url.searchParams.get("label");
  if (label) {
    const marker = `\\label{${label}}`;
    const offset = content.indexOf(marker);
    if (offset < 0 || content.indexOf(marker, offset + marker.length) >= 0) throw new Error("Label missing or ambiguous");
    return { file, offset };
  }
  // For unlabeled proof paragraphs require the original text anchor, not a stale line number.
  const anchor = url.searchParams.get("anchor");
  if (!anchor) throw new Error("Missing source anchor");
  const offset = content.indexOf(anchor);
  if (offset < 0 || content.indexOf(anchor, offset + anchor.length) >= 0) throw new Error("Source paragraph changed or is ambiguous");
  return { file, offset };
}

export async function openProofSourceLink(href: string) {
  const state = useDocumentStore.getState();
  if (!state.projectRoot) throw new Error("Open a paper project first");
  const { file, offset } = sourceTarget(href, state.files);
  openProjectFile(file.id);
  // Match the existing SyncTeX navigation: wait for the target editor to mount.
  setTimeout(() => {
    const current = useDocumentStore.getState();
    if (current.projectRoot === state.projectRoot && current.activeFileId === file.id) current.requestJumpToPosition(offset);
  }, 100);
}
