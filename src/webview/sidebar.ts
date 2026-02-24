import type { Node } from "../schema";
import { getState, subscribe } from "./state";

const DEFAULT_FILL = "#888888";
const DEFAULT_TEXT = "#cccccc";

export interface SidebarCallbacks {
  onNodeChanged: (
    id: string,
    changes: Partial<Pick<Node, "nodeColor" | "labelColor">>
  ) => void;
}

export function setupSidebar(
  container: HTMLElement,
  callbacks: SidebarCallbacks
): void {
  const fillInput = container.querySelector<HTMLInputElement>("#fill-color")!;
  const textInput = container.querySelector<HTMLInputElement>("#text-color")!;

  fillInput.addEventListener("input", () => {
    const { selectedNodeId } = getState();
    if (selectedNodeId) {
      callbacks.onNodeChanged(selectedNodeId, { nodeColor: fillInput.value });
    }
  });

  textInput.addEventListener("input", () => {
    const { selectedNodeId } = getState();
    if (selectedNodeId) {
      callbacks.onNodeChanged(selectedNodeId, { labelColor: textInput.value });
    }
  });

  subscribe(() => {
    const { document: doc, selectedNodeId, locked } = getState();
    const selectedNode = selectedNodeId
      ? doc.nodes.find((n) => n.id === selectedNodeId)
      : null;

    const hidden = !selectedNode || locked;
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = hidden ? "none" : "";

    if (selectedNode) {
      fillInput.value = selectedNode.nodeColor ?? DEFAULT_FILL;
      textInput.value = selectedNode.labelColor ?? DEFAULT_TEXT;
    }
  });
}
