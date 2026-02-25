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
    const { selectedNodeIds } = getState();
    for (const id of selectedNodeIds) {
      callbacks.onNodeChanged(id, { nodeColor: fillInput.value });
    }
  });

  textInput.addEventListener("input", () => {
    const { selectedNodeIds } = getState();
    for (const id of selectedNodeIds) {
      callbacks.onNodeChanged(id, { labelColor: textInput.value });
    }
  });

  subscribe(() => {
    const { document: doc, selectedNodeIds, locked } = getState();
    const firstSelected = selectedNodeIds.length > 0
      ? doc.nodes.find((n) => n.id === selectedNodeIds[0])
      : null;

    const hidden = !firstSelected || locked;
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = hidden ? "none" : "";

    if (firstSelected) {
      fillInput.value = firstSelected.nodeColor ?? DEFAULT_FILL;
      textInput.value = firstSelected.labelColor ?? DEFAULT_TEXT;
    }
  });
}
