import type { Node } from "../../schema";
import {
  getState,
  setSelectedNodeIds,
  addNodes,
  deleteNodes,
  deleteEdges,
  generateNodeId,
  getDescendantIds,
} from "../state";

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
      if (state.selectedEdgeIds.length > 0) {
        deleteEdges(state.selectedEdgeIds);
        onEdit();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      if (state.selectedNodeIds.length > 0) {
        // Expand selection to include all descendants
        const expandedIds = new Set(state.selectedNodeIds);
        for (const id of state.selectedNodeIds) {
          for (const descId of getDescendantIds(id)) {
            expandedIds.add(descId);
          }
        }
        clipboard = state.document.nodes
          .filter((n) => expandedIds.has(n.id))
          .map((n) => ({ ...n }));
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      if (clipboard.length > 0) {
        // Build old→new ID map
        const idMap = new Map<string, string>();
        for (const n of clipboard) {
          idMap.set(n.id, generateNodeId());
        }
        const pastedNodes: Node[] = clipboard.map((n) => {
          const pasted: Node = {
            ...n,
            id: idMap.get(n.id)!,
            bounds: { ...n.bounds, x: n.bounds.x + 20, y: n.bounds.y + 20 },
          };
          // Remap parentId if parent is in the paste set
          if (n.parentId && idMap.has(n.parentId)) {
            pasted.parentId = idMap.get(n.parentId);
          } else {
            delete pasted.parentId;
          }
          return pasted;
        });
        addNodes(pastedNodes);
        // Select only root pasted nodes (those without a parentId in the paste set)
        const pastedIdSet = new Set(pastedNodes.map((n) => n.id));
        const rootNodes = pastedNodes.filter(
          (n) => !n.parentId || !pastedIdSet.has(n.parentId)
        );
        setSelectedNodeIds(rootNodes.map((n) => n.id));
        // Update clipboard positions for cascading paste
        clipboard = pastedNodes.map((n) => ({ ...n }));
        onEdit();
      }
      return;
    }
  });
}
