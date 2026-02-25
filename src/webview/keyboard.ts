import type { Node } from "../schema";
import {
  getState,
  setSelectedNodeIds,
  addNodes,
  deleteNodes,
  generateNodeId,
} from "./state";

export function setupKeyboard(onEdit: () => void): void {
  let clipboard: Node[] = [];

  window.addEventListener("keydown", (e) => {
    const state = getState();
    if (state.locked) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selectedNodeIds.length > 0) {
        deleteNodes(state.selectedNodeIds);
        onEdit();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      if (state.selectedNodeIds.length > 0) {
        const idSet = new Set(state.selectedNodeIds);
        clipboard = state.document.nodes
          .filter((n) => idSet.has(n.id))
          .map((n) => ({ ...n }));
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      if (clipboard.length > 0) {
        const pastedNodes = clipboard.map((n) => ({
          ...n,
          id: generateNodeId(),
          x: n.x + 20,
          y: n.y + 20,
        }));
        addNodes(pastedNodes);
        setSelectedNodeIds(pastedNodes.map((n) => n.id));
        // Update clipboard positions for cascading paste
        clipboard = pastedNodes.map((n) => ({ ...n }));
        onEdit();
      }
      return;
    }
  });
}
