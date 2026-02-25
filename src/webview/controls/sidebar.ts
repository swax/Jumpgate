import type { Node } from "../../schema";
import { getState, subscribe } from "../state";

const DEFAULT_FILL = "#888888";
const DEFAULT_TEXT = "#cccccc";

export interface SidebarCallbacks {
  onNodeChanged: (
    id: string,
    changes: Partial<Pick<Node, "nodeColor" | "labelColor">>
  ) => void;
  onNodesChanged?: (
    updates: {
      id: string;
      changes: Partial<Pick<Node, "nodeColor" | "labelColor">>;
    }[]
  ) => void;
}

export function setupSidebar(
  container: HTMLElement,
  callbacks: SidebarCallbacks
): void {
  const fillInput = container.querySelector<HTMLInputElement>("#fill-color")!;
  const textInput = container.querySelector<HTMLInputElement>("#text-color")!;
  const textWrapper = container.querySelector<HTMLElement>("#text-color-wrapper")!;
  const textLabel = container.querySelector<HTMLElement>("#text-color-label")!;

  let targetIds: string[] = [];
  let currentFill = DEFAULT_FILL;
  let currentText = DEFAULT_TEXT;

  function updateTextPreview(): void {
    textWrapper.style.backgroundColor = currentFill;
    textLabel.style.color = currentText;
  }

  function setColors(fill: string, text: string): void {
    currentFill = fill;
    currentText = text;
    fillInput.value = fill;
    textInput.value = text;
    updateTextPreview();
  }

  function applyChanges(
    changes: Partial<Pick<Node, "nodeColor" | "labelColor">>
  ): void {
    if (targetIds.length === 0) return;
    if (callbacks.onNodesChanged) {
      callbacks.onNodesChanged(
        targetIds.map((id) => ({
          id,
          changes,
        }))
      );
      return;
    }
    for (const id of targetIds) {
      callbacks.onNodeChanged(id, changes);
    }
  }

  fillInput.addEventListener("input", () => {
    currentFill = fillInput.value;
    applyChanges({ nodeColor: currentFill });
    updateTextPreview();
  });

  textInput.addEventListener("input", () => {
    currentText = textInput.value;
    applyChanges({ labelColor: currentText });
    updateTextPreview();
  });

  setColors(DEFAULT_FILL, DEFAULT_TEXT);

  subscribe(() => {
    const { document: doc, selectedNodeIds, locked } = getState();
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = locked ? "none" : "";

    if (selectedNodeIds.length > 0) {
      const node = doc.nodes.find((n) => n.id === selectedNodeIds[0]);
      if (node) {
        targetIds = selectedNodeIds;
        setColors(node.nodeColor ?? DEFAULT_FILL, node.labelColor ?? DEFAULT_TEXT);
      }
    } else {
      targetIds = [];
    }
  });
}
