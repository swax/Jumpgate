import { BlurFilter, Container, Graphics, FederatedPointerEvent } from "pixi.js";
import type { Bounds, Node } from "../../schema";
import type { NodeChanges } from "../shared";
import { colorToHex, DOUBLE_CLICK_MS, DRAG_THRESHOLD } from "../shared";
import { startLabelEdit, type LabelEditContext } from "./labelEditor";
import { showGroupDragMessage, hideGroupDragMessage } from "../interactions/groupStatus";
import { getState, getDescendantIds, getChildNodeIds, getNodeById } from "../state";
import { snap } from "../controls/gridSnap";
import { drawShape, drawGlowLayer, drawNebulaBg } from "./shapes";
import { findNodeAtPoint } from "./hitTest";
import { getNodeMeta, setNodeMeta, setNodeRectMeta } from "./metadata";


export function getContainerBounds(container: Container): Bounds {
  const meta = getNodeMeta(container);
  return {
    x: container.position.x,
    y: container.position.y,
    width: meta?.nodeWidth ?? 100,
    height: meta?.nodeHeight ?? 100,
  };
}

export function setContainerBounds(container: Container, bounds: Bounds): void {
  container.position.set(bounds.x, bounds.y);
  const meta = getNodeMeta(container);
  if (meta) {
    meta.nodeWidth = bounds.width;
    meta.nodeHeight = bounds.height;
  } else {
    setNodeMeta(container, {
      fillColor: null,
      strokeColor: null,
      nodeWidth: bounds.width,
      nodeHeight: bounds.height,
      hasFileLink: false,
      fileLinkPath: null,
    });
  }
}

/** IDs of nodes currently being moved as part of a multi-drag. */
const groupDraggingIds = new Set<string>();

/** IDs of nodes currently being dragged (including single drag). */
const draggingIds = new Set<string>();

export interface CanvasNodeCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string, preview?: boolean) => void;
  getSelectedNodeIds: () => string[];
  isLocked: () => boolean;
  isEdgeMode: () => boolean;
  isSnapEnabled: () => boolean;
  getViewport: () => Container;
  onDragUpdate: () => void;
}

export function createCanvasNode(
  node: Node,
  labelColor: string,
  labelEditCtx: LabelEditContext,
  callbacks: CanvasNodeCallbacks,
  theme?: string
): Container {
  const group = new Container();
  group.label = node.id;
  setContainerBounds(group, node.bounds);
  group.eventMode = "static";
  group.cursor = node.fileLink ? "pointer" : "default";

  const fillColor = node.nodeColor ? colorToHex(node.nodeColor, 0) : null;
  const strokeColor = node.borderColor ? colorToHex(node.borderColor, 0) : null;
  const hasChildren = getChildNodeIds(node.id).length > 0;
  const isSpace = theme === "space";

  // Glow layer — only for space theme
  const glow = new Graphics();
  glow.label = "node-glow";
  (glow as any).__isGroup = hasChildren;
  if (isSpace && fillColor !== null) {
    if (hasChildren || node.shape !== "text") {
      drawGlowLayer(glow, node.bounds.width, node.bounds.height, fillColor);
      glow.filters = [new BlurFilter({ strength: 5, quality: 3 })];
    }
  }
  glow.eventMode = "none";

  const rect = new Graphics();
  rect.label = "node-rect";
  if (hasChildren && isSpace && fillColor !== null) {
    drawNebulaBg(rect, node.bounds.width, node.bounds.height, fillColor);
  } else {
    drawShape(rect, node.bounds.width, node.bounds.height, node.shape, fillColor, strokeColor, node.direction, theme);
  }
  rect.eventMode = "passive";

  group.addChild(glow);
  group.addChild(rect);

  const meta = {
    fillColor,
    strokeColor,
    nodeShape: node.shape,
    nodeDirection: node.direction,
    nodeWidth: node.bounds.width,
    nodeHeight: node.bounds.height,
    hasFileLink: !!node.fileLink,
    fileLinkPath: node.fileLink?.path ?? null,
  };
  setNodeMeta(group, meta);
  setNodeRectMeta(rect, meta);

  // Tooltip on linked node hover
  group.on("pointerover", () => {
    const m = getNodeMeta(group);
    if (m?.fileLinkPath) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = `${m.fileLinkPath} (Double-click)`;
    }
  });
  group.on("pointerout", () => {
    const m = getNodeMeta(group);
    if (m?.fileLinkPath) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = "";
    }
  });

  const nodeId = node.id;

  // --- Click / double-click detection ---
  let pointerDownPos: { x: number; y: number } | null = null;
  let lastClickTime = 0;

  // --- Drag state ---
  let isDragging = false;
  const startPositions = new Map<string, { x: number; y: number }>();
  const cascadePositions = new Map<string, { x: number; y: number }>();

  group.on("pointerdown", (e: FederatedPointerEvent) => {
    // Middle-click on linked node — open file in new pinned tab
    if (e.button === 1 && getNodeMeta(group)?.hasFileLink) {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onOpenFileLink(nodeId, false);
      return;
    }

    // Right-click is handled by the context menu; ignore here so it doesn't
    // feed into the double-click timer.
    if (e.button === 2) return;

    // In locked mode, don't stop propagation so drag-to-pan works through nodes.
    // Only register a click if pointer didn't move (like a Windows button).
    if (callbacks.isLocked()) {
      const downPos = { x: e.global.x, y: e.global.y };
      const onUpLocked = (ue: FederatedPointerEvent) => {
        group.off("pointerup", onUpLocked);
        group.off("pointerupoutside", onUpLocked);
        const dx = ue.global.x - downPos.x;
        const dy = ue.global.y - downPos.y;
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
          const now = Date.now();
          if (now - lastClickTime < DOUBLE_CLICK_MS && getNodeMeta(group)?.hasFileLink) {
            lastClickTime = 0;
            callbacks.onOpenFileLink(nodeId);
          } else {
            lastClickTime = now;
            callbacks.onSelect(nodeId, false);
          }
        }
      };
      group.on("pointerup", onUpLocked);
      group.on("pointerupoutside", onUpLocked);
      return;
    }

    if (callbacks.isEdgeMode()) return; // Let event propagate to viewport for edge creation

    // Unselected node in edit mode: don't stop propagation (allows pan on drag).
    // Only register a click/double-click if pointer didn't move.
    if (!callbacks.getSelectedNodeIds().includes(nodeId)) {
      const downPos = { x: e.global.x, y: e.global.y };
      const onUpUnselected = (ue: FederatedPointerEvent) => {
        group.off("pointerup", onUpUnselected);
        group.off("pointerupoutside", onUpUnselected);
        const dx = ue.global.x - downPos.x;
        const dy = ue.global.y - downPos.y;
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
          if ((ue.ctrlKey || ue.metaKey) && getNodeMeta(group)?.hasFileLink) {
            callbacks.onSelect(nodeId, false);
            callbacks.onOpenFileLink(nodeId);
          } else {
            const now = Date.now();
            if (now - lastClickTime < DOUBLE_CLICK_MS) {
              lastClickTime = 0;
              callbacks.onSelect(nodeId, false);
              startLabelEdit(labelEditCtx, group, nodeId);
            } else {
              lastClickTime = now;
              callbacks.onSelect(nodeId, ue.shiftKey);
            }
          }
        }
      };
      group.on("pointerup", onUpUnselected);
      group.on("pointerupoutside", onUpUnselected);
      return;
    }

    e.stopPropagation();

    const viewport = callbacks.getViewport();
    const local = viewport.toLocal(e.global);
    pointerDownPos = { x: local.x, y: local.y };
    isDragging = false;

    // Record start positions for multi-drag
    startPositions.clear();
    cascadePositions.clear();
    const selectedIds = callbacks.getSelectedNodeIds();
    const primaryIds = new Set<string>();

    if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
      for (const id of selectedIds) {
        const g = id === nodeId ? group : (viewport.getChildByLabel(id) as Container | null);
        if (g) {
          startPositions.set(id, { x: g.position.x, y: g.position.y });
          groupDraggingIds.add(id);
          primaryIds.add(id);
        }
      }
    }

    // Collect cascade children (descendants of primary movers)
    const allPrimaryIds = primaryIds.size > 0 ? primaryIds : new Set([nodeId]);
    for (const pid of allPrimaryIds) {
      const descIds = getDescendantIds(pid);
      for (const did of descIds) {
        if (allPrimaryIds.has(did)) continue; // already a primary mover
        if (cascadePositions.has(did)) continue; // already tracked
        const g = viewport.getChildByLabel(did) as Container | null;
        if (g) {
          cascadePositions.set(did, { x: g.position.x, y: g.position.y });
          groupDraggingIds.add(did);
        }
      }
    }

    // Group-drop tracking
    let dropTargetId: string | null = null;
    let removeFromGroup = false;

    const onMove = (me: FederatedPointerEvent) => {
      if (!pointerDownPos) return;
      const localPt = viewport.toLocal(me.global);
      const dx = localPt.x - pointerDownPos.x;
      const dy = localPt.y - pointerDownPos.y;

      if (!isDragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

      if (!isDragging) {
        isDragging = true;
        draggingIds.add(nodeId);
        // Record start if single drag
        if (startPositions.size === 0) {
          startPositions.set(nodeId, { x: group.position.x, y: group.position.y });
        }
        // Boost z-index so dragged nodes appear above everything
        const DRAG_Z_BASE = 8900;
        group.zIndex = DRAG_Z_BASE;
        let zOffset = 1;
        for (const id of startPositions.keys()) {
          if (id === nodeId) continue;
          const g = viewport.getChildByLabel(id) as Container | null;
          if (g) g.zIndex = DRAG_Z_BASE + zOffset++;
        }
        for (const id of cascadePositions.keys()) {
          const g = viewport.getChildByLabel(id) as Container | null;
          if (g) g.zIndex = DRAG_Z_BASE + zOffset++;
        }
      }

      // Move main node
      const myStart = startPositions.get(nodeId)!;
      let newX = myStart.x + dx;
      let newY = myStart.y + dy;
      if (callbacks.isSnapEnabled()) {
        newX = snap(newX);
        newY = snap(newY);
      }
      group.position.set(newX, newY);

      // Multi-drag: move others
      const actualDx = group.position.x - myStart.x;
      const actualDy = group.position.y - myStart.y;
      if (startPositions.size > 1) {
        for (const [id, start] of startPositions) {
          if (id === nodeId) continue;
          const other = viewport.getChildByLabel(id) as Container | null;
          if (other) {
            other.position.set(start.x + actualDx, start.y + actualDy);
          }
        }
      }

      // Cascade drag: move descendants
      for (const [id, start] of cascadePositions) {
        const other = viewport.getChildByLabel(id) as Container | null;
        if (other) {
          other.position.set(start.x + actualDx, start.y + actualDy);
        }
      }

      // --- Group drag detection (only for single-node drag) ---
      dropTargetId = null;
      removeFromGroup = false;
      if (startPositions.size <= 1) {
        const groupMeta = getNodeMeta(group);
        const nodeWidth = groupMeta?.nodeWidth ?? 100;
        const nodeHeight = groupMeta?.nodeHeight ?? 100;
        const centerX = group.position.x + nodeWidth / 2;
        const centerY = group.position.y + nodeHeight / 2;

        // Exclude this node + its descendants from hit testing
        const excludeIds = new Set([nodeId, ...getDescendantIds(nodeId)]);
        const hitNode = findNodeAtPoint(centerX, centerY, viewport, excludeIds);

        const currentNode = getNodeById(nodeId);
        const currentParentId = currentNode?.parentId;

        if (hitNode) {
          dropTargetId = hitNode.nodeId;
          const targetNode = getNodeById(hitNode.nodeId);
          const targetLabel = targetNode?.label || targetNode?.id || hitNode.nodeId;
          if (currentParentId && currentParentId !== hitNode.nodeId) {
            showGroupDragMessage(`Move to ${targetLabel}`);
          } else if (!currentParentId || currentParentId !== hitNode.nodeId) {
            showGroupDragMessage(`Add to ${targetLabel}`);
          } else {
            hideGroupDragMessage();
          }
        } else if (currentParentId) {
          // Check if center is outside current parent's bounds
          const parentContainer = viewport.getChildByLabel(currentParentId) as Container | null;
          if (parentContainer) {
            const pb = getContainerBounds(parentContainer);
            if (centerX < pb.x || centerX > pb.x + pb.width || centerY < pb.y || centerY > pb.y + pb.height) {
              const parentNode = getNodeById(currentParentId);
              const parentLabel = parentNode?.label || parentNode?.id || currentParentId;
              showGroupDragMessage(`Remove from ${parentLabel}`);
              removeFromGroup = true;
            } else {
              hideGroupDragMessage();
            }
          } else {
            hideGroupDragMessage();
          }
        } else {
          hideGroupDragMessage();
        }
      }

      callbacks.onDragUpdate();
    };

    const onUp = (ue: FederatedPointerEvent) => {
      group.off("globalpointermove", onMove);
      group.off("pointerup", onUp);
      group.off("pointerupoutside", onUp);

      if (isDragging) {
        // Build updates for all moved nodes (primary + cascade)
        const updates: { id: string; changes: NodeChanges }[] = [];

        for (const id of startPositions.keys()) {
          const g = id === nodeId ? group : (viewport.getChildByLabel(id) as Container | null);
          if (g) {
            updates.push({ id, changes: { bounds: { x: Math.round(g.position.x), y: Math.round(g.position.y) } } });
          }
        }
        for (const id of cascadePositions.keys()) {
          const g = viewport.getChildByLabel(id) as Container | null;
          if (g) {
            updates.push({ id, changes: { bounds: { x: Math.round(g.position.x), y: Math.round(g.position.y) } } });
          }
        }

        // Apply group change for single-node drag
        if (startPositions.size <= 1) {
          if (dropTargetId) {
            const mainUpdate = updates.find((u) => u.id === nodeId);
            if (mainUpdate) {
              mainUpdate.changes.parentId = dropTargetId;
            } else {
              updates.push({ id: nodeId, changes: { parentId: dropTargetId } });
            }
          } else if (removeFromGroup) {
            const mainUpdate = updates.find((u) => u.id === nodeId);
            if (mainUpdate) {
              mainUpdate.changes.parentId = null;
            } else {
              updates.push({ id: nodeId, changes: { parentId: null } });
            }
          }
        }

        startPositions.clear();
        cascadePositions.clear();
        groupDraggingIds.clear();
        draggingIds.delete(nodeId);
        hideGroupDragMessage();

        if (updates.length > 1) {
          callbacks.onNodesChanged(updates);
        } else if (updates.length === 1) {
          callbacks.onNodeChanged(updates[0].id, updates[0].changes);
        }
      } else {
        // Click (no drag)
        groupDraggingIds.clear();
        draggingIds.delete(nodeId);
        startPositions.clear();
        cascadePositions.clear();

        const now = Date.now();
        if (getNodeMeta(group)?.hasFileLink && ue.ctrlKey) {
          // Ctrl+Click on linked node — open file
          callbacks.onSelect(nodeId, false);
          callbacks.onOpenFileLink(nodeId);
        } else if (now - lastClickTime < DOUBLE_CLICK_MS) {
          // Double click
          lastClickTime = 0;
          startLabelEdit(labelEditCtx, group, nodeId);
        } else {
          lastClickTime = now;
          callbacks.onSelect(nodeId, ue.shiftKey);
        }
      }

      pointerDownPos = null;
      isDragging = false;
    };

    group.on("globalpointermove", onMove);
    group.on("pointerup", onUp);
    group.on("pointerupoutside", onUp);
  });

  return group;
}

export function isDraggingNode(id: string): boolean {
  return draggingIds.has(id) || groupDraggingIds.has(id);
}

export function updateCanvasNode(group: Container, node: Node, labelColor: string, theme?: string): void {
  if (draggingIds.has(node.id) || groupDraggingIds.has(node.id)) return;

  const glow = group.getChildByLabel("node-glow") as Graphics | null;
  const rect = group.getChildByLabel("node-rect") as Graphics;

  setContainerBounds(group, node.bounds);

  const fillColor = node.nodeColor ? colorToHex(node.nodeColor, 0) : null;
  const strokeColor = node.borderColor ? colorToHex(node.borderColor, 0) : null;
  const hasChildren = getChildNodeIds(node.id).length > 0;
  const isSpace = theme === "space";

  // Rebuild glow layer — only for space theme
  if (glow) {
    glow.clear();
    (glow as any).__isGroup = hasChildren;
    if (isSpace && fillColor !== null && (hasChildren || node.shape !== "text")) {
      drawGlowLayer(glow, node.bounds.width, node.bounds.height, fillColor);
      if (!glow.filters || !(glow.filters as BlurFilter[])[0]) {
        glow.filters = [new BlurFilter({ strength: 5, quality: 3 })];
      }
    } else {
      glow.filters = [];
    }
  }

  // Rebuild rect
  rect.clear();
  if (hasChildren && isSpace && fillColor !== null) {
    drawNebulaBg(rect, node.bounds.width, node.bounds.height, fillColor);
  } else {
    drawShape(rect, node.bounds.width, node.bounds.height, node.shape, fillColor, strokeColor, node.direction, theme);
  }

  const updatedMeta = {
    fillColor,
    strokeColor,
    nodeShape: node.shape,
    nodeDirection: node.direction,
    nodeWidth: node.bounds.width,
    nodeHeight: node.bounds.height,
    hasFileLink: !!node.fileLink,
    fileLinkPath: node.fileLink?.path ?? null,
  };
  setNodeMeta(group, updatedMeta);
  setNodeRectMeta(rect, updatedMeta);

  group.cursor = updatedMeta.hasFileLink ? "pointer" : "default";
}
