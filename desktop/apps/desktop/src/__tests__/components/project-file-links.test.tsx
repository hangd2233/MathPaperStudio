import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), show: vi.fn(), external: vi.fn(), refresh: vi.fn() }));
vi.mock("@/stores/document-store", () => ({ useDocumentStore: { getState: () => ({
  projectRoot: "D:\\Sync\\论文", files: [{ id: "working/proof map.pdf", relativePath: "working/proof map.pdf", type: "pdf" }],
  setActiveFile: mocks.select, refreshFiles: mocks.refresh,
}) } }));
vi.mock("@/stores/preview-store", () => ({ usePreviewStore: { getState: () => ({ setEditorVisible: mocks.show }) } }));
vi.mock("@/lib/backend/desktop-host", () => ({ openExternal: mocks.external }));
import { openProjectFile, openProjectLink, projectLinkPath, projectUrlTransform } from "@/lib/project-file-links";
import { Message } from "@/components/agent-chat/chat-message";
beforeEach(() => vi.clearAllMocks());
it.each(["working/proof%20map.pdf", "D:/Sync/论文/working/proof%20map.pdf", "D:\\Sync\\论文\\working\\proof map.pdf", "file:///D:/Sync/论文/working/proof%20map.pdf", "/D:/Sync/论文/working/proof%20map.pdf"])("opens %s in the existing viewer", async (path) => {
  await openProjectLink(path);
  expect(mocks.select).toHaveBeenCalledWith("working/proof map.pdf");
  expect(mocks.show).not.toHaveBeenCalled();
  expect(mocks.external).not.toHaveBeenCalled();
});
it("keeps the TeX pane unchanged even when selecting the same PDF again", () => {
  openProjectFile("working/proof map.pdf"); openProjectFile("working/proof map.pdf");
  expect(mocks.show).not.toHaveBeenCalled();
  expect(mocks.select).toHaveBeenCalledTimes(2);
});
it("blocks traversal, sibling-prefix and executable schemes", async () => {
  expect(() => projectLinkPath("../private.pdf", "D:/Sync/论文")).toThrow();
  expect(() => projectLinkPath("D:/Sync/论文-other/a.pdf", "D:/Sync/论文")).toThrow();
  await expect(openProjectLink("javascript:alert(1)")).rejects.toThrow();
  expect(projectUrlTransform("javascript:alert(1)", "href")).toBe("");
  expect(mocks.select).not.toHaveBeenCalled();
});
it("supports POSIX paths and reports missing local files", async () => {
  expect(projectLinkPath("/Users/me/Paper/map.pdf", "/Users/me/Paper")).toBe("map.pdf");
  await expect(openProjectLink("missing.pdf")).rejects.toThrow("not found");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("uses the external opener for ordinary web links", async () => {
  await openProjectLink("https://example.org"); expect(mocks.external).toHaveBeenCalledWith("https://example.org");
});
it("intercepts a rendered Windows PDF link without navigating the WebView", async () => {
  const element=document.createElement("div"); const root=createRoot(element);
  try {
    await act(async () => root.render(<Message item={{id:"1",type:"agentMessage",text:"[查看 PDF](D:/Sync/论文/working/proof%20map.pdf)"}} />));
    const link=element.querySelector("a")!;
    expect(link.getAttribute("href")).toContain("D:/Sync/");
    const click=new MouseEvent("click",{bubbles:true,cancelable:true});
    await act(async () => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(mocks.select).toHaveBeenCalledWith("working/proof map.pdf");
    expect(mocks.show).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
