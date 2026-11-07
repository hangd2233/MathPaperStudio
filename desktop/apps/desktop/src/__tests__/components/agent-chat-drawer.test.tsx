import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentChatDrawer } from "@/components/agent-chat/agent-chat-drawer";
import { useAgentSetupStore } from "@/stores/agent-setup-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";

vi.mock("@/stores/agent-chat-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/agent-chat-store")>()),
  ensureAgentEvents: vi.fn(async () => {}),
}));

it("mounts the document chat drawer with real store hooks and updates selected state", async () => {
  const check = vi
    .spyOn(useAgentSetupStore.getState(), "checkStatus")
    .mockResolvedValue(undefined);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AgentChatDrawer />));
    expect(container.textContent).toContain("What would you like to work on?");
    await act(async () =>
      useAgentChatStore.setState({ error: "Test connection error" }),
    );
    expect(container.textContent).toContain("Test connection error");
    await act(async () => useAgentChatStore.getState().handleEvent({ method: "connection/interrupted", params: {} }));
    expect(container.querySelector("output")?.textContent).toContain("状态同步暂时中断");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Test connection error");
    await act(async () => useAgentChatStore.getState().handleEvent({ method: "connection/restored", params: {} }));
    expect(container.textContent).not.toContain("状态同步暂时中断");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Test connection error");
  } finally {
    await act(async () => root.unmount());
    useAgentChatStore.setState({ error: null, connectionWarning: null });
    check.mockRestore();
  }
});
