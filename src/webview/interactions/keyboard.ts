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

let clipboard: Node[] = [];

export function hasClipboard(): boolean {
  return clipboard.length > 0;
}

export function copySelectedNodes(): void {
  const state = getState();
  if (state.selectedNodeIds.length > 0) {
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
}

export function pasteNodes(onEdit: () => void): void {
  if (clipboard.length > 0) {
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
      if (n.parentId && idMap.has(n.parentId)) {
        pasted.parentId = idMap.get(n.parentId);
      } else {
        delete pasted.parentId;
      }
      return pasted;
    });
    addNodes(pastedNodes);
    const pastedIdSet = new Set(pastedNodes.map((n) => n.id));
    const rootNodes = pastedNodes.filter(
      (n) => !n.parentId || !pastedIdSet.has(n.parentId)
    );
    setSelectedNodeIds(rootNodes.map((n) => n.id));
    clipboard = pastedNodes.map((n) => ({ ...n }));
    onEdit();
  }
}

export function deleteSelected(onEdit: () => void): void {
  const state = getState();
  if (state.selectedNodeIds.length > 0) {
    deleteNodes(state.selectedNodeIds);
    onEdit();
  }
  if (state.selectedEdgeIds.length > 0) {
    deleteEdges(state.selectedEdgeIds);
    onEdit();
  }
}

export function cutSelectedNodes(onEdit: () => void): void {
  copySelectedNodes();
  deleteSelected(onEdit);
}

export function setupKeyboard(onEdit: () => void): void {
  window.addEventListener("keydown", (e) => {
    const state = getState();
    if (state.locked) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelected(onEdit);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      copySelectedNodes();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "x") {
      cutSelectedNodes(onEdit);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      pasteNodes(onEdit);
      return;
    }
  });
}
