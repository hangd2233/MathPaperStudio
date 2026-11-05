import { useProofPdfNavigation } from "@/lib/proof-pdf-links";
import { defaultUrlTransform } from "react-markdown";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";
import { openExternal } from "@/lib/backend/desktop-host";

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("Link is outside the current project");
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

export function projectLinkPath(href: string, root: string): string {
  let path = decodeURIComponent(href.split(/[?#]/, 1)[0]).replace(/\\/g, "/");
  if (/^file:/i.test(path)) {
    const url = new URL(href);
    if (url.hostname && url.hostname !== "localhost")
      throw new Error("Remote file links are not supported");
    path = decodeURIComponent(url.pathname);
  }
  path = path.replace(/^\/([a-z]:\/)/i, "$1");
  const windows = /^[a-z]:[/\\]/i.test(root);
  const base = normalize(root);
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path);
  const full = normalize(absolute ? path : `${base}/${path}`);
  const comparable = windows ? full.toLowerCase() : full;
  const prefix = `${windows ? base.toLowerCase() : base}/`;
  if (!comparable.startsWith(prefix))
    throw new Error("Link is outside the current project");
  return full.slice(base.length + 1);
}

export function projectUrlTransform(url: string, key: string): string {
  // ReactMarkdown's default sanitizer treats a Windows drive as a URL scheme.
  if (key === "href" && (/^\/?[a-z]:[/\\]/i.test(url) || /^file:/i.test(url)))
    return url;
  return defaultUrlTransform(url);
}

export function openProjectFile(id: string): void {
  const state = useDocumentStore.getState();
  const pdf = state.files.find((f) => f.id === id)?.type === "pdf";
  if (pdf) useProofPdfNavigation.setState({ target: null });
  state.setActiveFile(id);
  if (!pdf) usePreviewStore.getState().setEditorVisible(true);
}

export async function openProjectLink(href: string): Promise<void> {
  if (/^(https?:|mailto:)/i.test(href)) {
    await openExternal(href);
    return;
  }
  if (
    !href ||
    (/^[a-z][a-z\d+.-]*:/i.test(href) &&
      !/^[a-z]:[/\\]/i.test(href) &&
      !/^file:/i.test(href))
  ) {
    throw new Error("Unsupported link");
  }
  const state = useDocumentStore.getState();
  if (!state.projectRoot) throw new Error("Open a project first");
  const path = projectLinkPath(href, state.projectRoot);
  const windows = /^[a-z]:[/\\]/i.test(state.projectRoot);
  const find = () =>
    useDocumentStore
      .getState()
      .files.find((file) =>
        windows
          ? file.relativePath.toLowerCase() === path.toLowerCase()
          : file.relativePath === path,
      );
  let file = find();
  if (!file) {
    await state.refreshFiles();
    file = find();
  }
  if (useDocumentStore.getState().projectRoot !== state.projectRoot) return;
  if (!file) throw new Error(`Project file not found: ${path}`);
  openProjectFile(file.id);
}
