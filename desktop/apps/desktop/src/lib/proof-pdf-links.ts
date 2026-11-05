import { create } from "zustand";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";
import { readProjectBytes } from "@/lib/tauri/fs";

type Destination = { page: number; x: number; y: number; fileId: string; projectRoot: string; bytes: Uint8Array; requestId: number; path: string };
export const useProofPdfNavigation = create<{ target: Destination | null }>(() => ({ target: null }));

export function parseProofPdfLink(href: string) {
  const u = new URL(href);
  if (u.protocol !== "prism-pdf:" || u.hostname !== "open") throw new Error("Unsupported PDF link");
  const file = u.searchParams.get("file") ?? "";
  const sha256 = u.searchParams.get("sha256") ?? "";
  const page = Number(u.searchParams.get("page"));
  const y = Number(u.searchParams.get("y"));
  if (!file.endsWith(".pdf") || /[:\\]/.test(file) || file.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid PDF path");
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(page) || page < 1 || !u.searchParams.has("y") || !Number.isFinite(y) || y < 0) throw new Error("Invalid PDF destination");
  return { file, sha256, page, y };
}

export async function openProofPdfLink(href: string) {
  const link = parseProofPdfLink(href);
  const state = useDocumentStore.getState();
  if (!state.projectRoot) throw new Error("Open the paper project first");
  const exact = state.files.filter(f => f.relativePath === link.file);
  const matches = exact.length ? exact : state.files.filter(f => f.relativePath.endsWith("/" + link.file));
  if (matches.length !== 1) throw new Error("Target PDF missing or ambiguous");
  const file = matches[0];
  const bytes = new Uint8Array(await readProjectBytes(file.ref));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (hash !== link.sha256) throw new Error("Target PDF version changed; update the proof-map links");
  const { getMupdfClient } = await import("@/lib/mupdf/mupdf-client");
  const client = getMupdfClient();
  const docId = await client.openDocument(bytes.slice().buffer);
  try {
    const count = await client.countPages(docId);
    if (link.page > count) throw new Error("PDF destination page is out of range");
    const size = await client.getPageSize(docId, link.page - 1);
    if (link.y > size.height) throw new Error("PDF destination coordinate is out of range");
  } finally {
    await client.closeDocument(docId);
  }
  if (useDocumentStore.getState().projectRoot !== state.projectRoot) return;
  useProofPdfNavigation.setState({ target: { fileId: file.id, projectRoot: state.projectRoot, page: link.page, x: 0, y: link.y, bytes, requestId: (useProofPdfNavigation.getState().target?.requestId ?? 0) + 1, path: file.relativePath } });
  if (state.projectId) usePreviewStore.getState().openSource({project:state.projectId,fileId:file.id,name:file.name});
  else usePreviewStore.getState().setVisible(true);
}
