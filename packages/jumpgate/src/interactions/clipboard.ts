import type { Node } from "../schema";
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
let lastMouseWorldX = 0;
let lastMouseWorldY = 0;

export function setLastMouseWorldPos(x: number, y: number): void {
  lastMouseWorldX = x;
  lastMouseWorldY = y;
}

export function resetClipboard(): void {
  clipboard = [];
  lastMouseWorldX = 0;
  lastMouseWorldY = 0;
}

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

    // Compute bounding box center of clipboard nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of clipboard) {
      minX = Math.min(minX, n.bounds.x);
      minY = Math.min(minY, n.bounds.y);
      maxX = Math.max(maxX, n.bounds.x + n.bounds.width);
      maxY = Math.max(maxY, n.bounds.y + n.bounds.height);
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Offset so the group centers on the mouse cursor
    const offsetX = lastMouseWorldX - centerX;
    const offsetY = lastMouseWorldY - centerY;

    const pastedNodes: Node[] = clipboard.map((n) => {
      const pasted: Node = {
        ...n,
        id: idMap.get(n.id)!,
        bounds: { ...n.bounds, x: n.bounds.x + offsetX, y: n.bounds.y + offsetY },
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
