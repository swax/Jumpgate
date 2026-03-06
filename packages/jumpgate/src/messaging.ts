import type { Bounds, Edge } from "./schema";
import type { NodeChanges } from "./shared";
import type { JumpgateCallbacks } from "./index";
import { getState, getNodeById, updateNode, updateNodes, updateEdge } from "./state";

let callbacks: JumpgateCallbacks = {};

export function setCallbacks(cb: JumpgateCallbacks): void {
  callbacks = cb;
}

export function getCallbacks(): JumpgateCallbacks {
  return callbacks;
}

// Debounced edit sender
let editTimeout: ReturnType<typeof setTimeout> | null = null;

export function sendEditDebounced(): void {
  if (editTimeout) {
    clearTimeout(editTimeout);
  }
  editTimeout = setTimeout(() => {
    editTimeout = null;
    callbacks.onDocumentChanged?.(getState().document);
  }, 100);
}

/** Scale pixel-offset anchors on edges connected to a node after it is resized. */
function scaleAnchorsForNode(nodeId: string, oldBounds: Bounds, newBounds: Bounds): void {
  if (oldBounds.width === newBounds.width && oldBounds.height === newBounds.height) return;
  const scaleX = newBounds.width / oldBounds.width;
  const scaleY = newBounds.height / oldBounds.height;
  for (const edge of getState().document.edges) {
    let fromAnchor: [number, number] | undefined;
    let toAnchor: [number, number] | undefined;
    if ("nodeId" in edge.from && edge.from.nodeId === nodeId && edge.from.anchor) {
      fromAnchor = [
        Math.round(edge.from.anchor[0] * scaleX),
        Math.round(edge.from.anchor[1] * scaleY),
      ];
    }
    if ("nodeId" in edge.to && edge.to.nodeId === nodeId && edge.to.anchor) {
      toAnchor = [Math.round(edge.to.anchor[0] * scaleX), Math.round(edge.to.anchor[1] * scaleY)];
    }
    if (fromAnchor || toAnchor) {
      const changes: Partial<Omit<Edge, "id">> = {};
      if (fromAnchor) changes.from = { ...edge.from, anchor: fromAnchor } as Edge["from"];
      if (toAnchor) changes.to = { ...edge.to, anchor: toAnchor } as Edge["to"];
      updateEdge(edge.id, changes);
    }
  }
}

// Helper wrappers: update state + send edit in one call
export const nodeChanged = (id: string, changes: NodeChanges) => {
  const oldNode = getNodeById(id);
  updateNode(id, changes);
  if (oldNode && changes.bounds) {
    const newNode = getNodeById(id);
    if (newNode) scaleAnchorsForNode(id, oldNode.bounds, newNode.bounds);
  }
  sendEditDebounced();
};
export const nodesChanged = (updates: { id: string; changes: NodeChanges }[]) => {
  const oldBounds = new Map<string, Bounds>();
  for (const u of updates) {
    if (u.changes.bounds) {
      const node = getNodeById(u.id);
      if (node) oldBounds.set(u.id, { ...node.bounds });
    }
  }
  updateNodes(updates);
  for (const [id, old] of oldBounds) {
    const node = getNodeById(id);
    if (node) scaleAnchorsForNode(id, old, node.bounds);
  }
  sendEditDebounced();
};
export const edgeChanged = (id: string, changes: Partial<Omit<Edge, "id">>) => {
  updateEdge(id, changes);
  sendEditDebounced();
};
