import {PaperSync} from "./paper-sync";
import { ManualWorkbench } from "./manual-workbench";
import { useManualStore } from "@/stores/manual-store";
import { ProofMapControls } from "./proof-map-controls";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { PdfReadingPane } from "./preview/pdf-reading-pane";
import { useTheme } from "next-themes";
import { AgentChatDrawer } from "@/components/agent-chat/agent-chat-drawer";
import { ProposedChangesPanel } from "@/components/agent-chat/proposed-changes-panel";
import { useDocumentStore } from "@/stores/document-store";
import { usePreviewStore } from "@/stores/preview-store";

const SIDEBAR_DEFAULT_SIZE = 15;
const SIDEBAR_MIN_SIZE = 10;
const SIDEBAR_COLLAPSED_WIDTH_PX = 48;
const SIDEBAR_COLLAPSED_SIZE_FALLBACK = 8;
const SIDEBAR_ANIMATION_MS = 280;

function easeInOutSmooth(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

export function WorkspaceLayout() {
  const projectId = useDocumentStore((s) => s.projectId);
  const manual = useManualStore(
    (s) => s.project !== projectId || !s.data || s.data.mode === "manual",
  );
  const initialized = useDocumentStore((s) => s.initialized);
  const { theme = "system", setTheme } = useTheme();
  const toolsVisible = usePreviewStore((s) => s.toolsVisible);
  const setToolsVisible = usePreviewStore((s) => s.setToolsVisible);
  const toolsRef = useRef<ImperativePanelHandle>(null);
  const pdfRef = useRef<ImperativePanelHandle>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const pdfButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (toolsVisible) toolsRef.current?.expand();
    else {
      toolsRef.current?.collapse();
      toolsButtonRef.current?.focus();
    }
  }, [toolsVisible, initialized]);
  const previewVisible = usePreviewStore((s) => s.visible);
  const setPreviewVisible = usePreviewStore((s) => s.setVisible);
  useEffect(() => {
    if (previewVisible) pdfRef.current?.expand();
    else {
      pdfRef.current?.collapse();
      pdfButtonRef.current?.focus();
    }
  }, [previewVisible, initialized]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const sidebarAnimationFrameRef = useRef<number | null>(null);
  const sidebarAnimatingRef = useRef(false);
  const expandedSidebarSizeRef = useRef(SIDEBAR_DEFAULT_SIZE);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarCollapsedSize, setSidebarCollapsedSize] = useState(
    SIDEBAR_COLLAPSED_SIZE_FALLBACK,
  );
  const codeVisible = usePreviewStore((s) => s.editorVisible);
  const setCodeVisible = usePreviewStore((s) => s.setEditorVisible);

  const getCollapsedSidebarSize = useCallback(() => {
    const workspaceWidth =
      workspaceRef.current?.clientWidth ?? window.innerWidth;
    if (!workspaceWidth) return SIDEBAR_COLLAPSED_SIZE_FALLBACK;
    return Math.min(
      18,
      Math.max(2.5, (SIDEBAR_COLLAPSED_WIDTH_PX / workspaceWidth) * 100),
    );
  }, []);

  const animateSidebarToSize = useCallback((targetSize: number) => {
    const sidebarPanel = sidebarPanelRef.current;
    if (!sidebarPanel) return;

    if (sidebarAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(sidebarAnimationFrameRef.current);
    }

    const startSize = sidebarPanel.getSize();
    const sizeDelta = targetSize - startSize;
    const startedAt = performance.now();
    sidebarAnimatingRef.current = true;

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / SIDEBAR_ANIMATION_MS, 1);
      const nextSize = startSize + sizeDelta * easeInOutSmooth(progress);

      sidebarPanel.resize(nextSize);

      if (progress < 1) {
        sidebarAnimationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      sidebarPanel.resize(targetSize);
      sidebarAnimationFrameRef.current = null;
      sidebarAnimatingRef.current = false;
    };

    sidebarAnimationFrameRef.current = window.requestAnimationFrame(step);
  }, []);

  const setSidebarPaneCollapsed = useCallback(
    (nextCollapsed: boolean) => {
      const sidebarPanel = sidebarPanelRef.current;
      if (!sidebarPanel) return;

      if (!nextCollapsed) {
        setSidebarCollapsed(false);
        animateSidebarToSize(expandedSidebarSizeRef.current);
      } else {
        const collapsedSize = getCollapsedSidebarSize();
        const currentSize = sidebarPanel.getSize();
        if (currentSize >= SIDEBAR_MIN_SIZE) {
          expandedSidebarSizeRef.current = currentSize;
        }
        setSidebarCollapsedSize(collapsedSize);
        setSidebarCollapsed(true);
        animateSidebarToSize(collapsedSize);
      }
    },
    [animateSidebarToSize, getCollapsedSidebarSize],
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarPaneCollapsed(!sidebarCollapsed);
  }, [setSidebarPaneCollapsed, sidebarCollapsed]);

  const setCodePaneVisible = useCallback(
    (visible: boolean) => {
      if (!visible && !previewVisible) {
        setPreviewVisible(true);
      }
      setCodeVisible(visible);
    },
    [previewVisible, setPreviewVisible],
  );

  const setPdfPaneVisible = useCallback(
    (visible: boolean) => {
      if (!visible && !codeVisible) {
        setCodeVisible(true);
      }
      setPreviewVisible(visible);
    },
    [codeVisible, setPreviewVisible],
  );

  // Cmd+\ / Ctrl+\ toggles the PDF preview pane.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setPdfPaneVisible(!previewVisible);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewVisible, setPdfPaneVisible]);

  useEffect(() => {
    return () => {
      if (sidebarAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(sidebarAnimationFrameRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const updateCollapsedSize = () => {
      const nextSize = getCollapsedSidebarSize();
      setSidebarCollapsedSize(nextSize);

      if (sidebarCollapsed && !sidebarAnimatingRef.current) {
        sidebarPanelRef.current?.resize(nextSize);
      }
    };

    updateCollapsedSize();

    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) return;

    const resizeObserver = new ResizeObserver(updateCollapsedSize);
    resizeObserver.observe(workspaceElement);

    return () => resizeObserver.disconnect();
  }, [getCollapsedSidebarSize, sidebarCollapsed]);

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <div
      ref={workspaceRef}
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
    >
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1"
        role="toolbar"
        aria-label="工作区布局与外观"
      >
        <button
          ref={toolsButtonRef}
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          aria-expanded={toolsVisible}
          onClick={() => setToolsVisible(!toolsVisible)}
        >
          {toolsVisible ? "收起写作面板" : "展开写作面板"}
        </button>
        <button
          ref={pdfButtonRef}
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          aria-expanded={previewVisible}
          onClick={() => setPdfPaneVisible(!previewVisible)}
        >
          {previewVisible ? "收起 PDF 阅读区" : "展开 PDF 阅读区"}
        </button>
        <PaperSync />
        <label className="ml-auto flex items-center gap-1 text-xs">
          外观
          <select
            aria-label="外观"
            className="rounded border bg-background px-2 py-1 text-foreground"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">跟随系统</option>
          </select>
        </label>
      </div>
      <PanelGroup
        autoSaveId="mps-workspace-panels-v2"
        direction="horizontal"
        className="min-h-0 flex-1"
      >
        <Panel
          id="sidebar"
          order={0}
          ref={sidebarPanelRef}
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_MIN_SIZE}
          maxSize={25}
          collapsible
          collapsedSize={sidebarCollapsedSize}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          onResize={(size) => {
            if (!sidebarAnimatingRef.current && size >= SIDEBAR_MIN_SIZE) {
              expandedSidebarSizeRef.current = size;
            }
          }}
          className="min-w-0 overflow-hidden"
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
            layoutControls={{
              codeVisible,
              pdfVisible: previewVisible,
              sidebarVisible: !sidebarCollapsed,
              setCodeVisible: setCodePaneVisible,
              setPdfVisible: setPdfPaneVisible,
              setSidebarVisible: (visible) => setSidebarPaneCollapsed(!visible),
            }}
          />
        </Panel>

        <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />

        <Panel
          id="writing-tools"
          order={1}
          ref={toolsRef}
          defaultSize={toolsVisible ? 25 : 0}
          minSize={20}
          maxSize={45}
          collapsible
          collapsedSize={0}
          onCollapse={() => setToolsVisible(false)}
          onExpand={() => setToolsVisible(true)}
          className="min-w-0 overflow-hidden"
        >
          <div
            className="h-full min-w-0 overflow-y-auto"
            style={{ visibility: toolsVisible ? "visible" : "hidden" }}
            aria-hidden={!toolsVisible}
          >
            <ManualWorkbench sidebar />
            {!manual && <ProofMapControls />}
          </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />
        <Panel
          id="editor-chat"
          order={2}
          defaultSize={28}
          minSize={25}
          className="min-w-0"
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div
              className="min-h-0 flex-1 overflow-hidden"
              style={{ display: codeVisible ? "block" : "none" }}
              aria-hidden={!codeVisible}
            >
              <LatexEditor />
            </div>
            {!manual && <ProposedChangesPanel />}
            {!manual && <AgentChatDrawer fillHeight={!codeVisible} />}
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />
        <Panel
          id="pdf-preview"
          order={3}
          ref={pdfRef}
          defaultSize={previewVisible ? 32 : 0}
          minSize={22}
          collapsible
          collapsedSize={0}
          onCollapse={() => setPreviewVisible(false)}
          onExpand={() => setPreviewVisible(true)}
          className="min-w-0"
        >
          <div
            className="h-full min-h-0"
            style={{ visibility: previewVisible ? "visible" : "hidden" }}
            aria-hidden={!previewVisible}
          >
            <PdfReadingPane />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
