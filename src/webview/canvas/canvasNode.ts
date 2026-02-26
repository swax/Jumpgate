import { Container, Graphics, Text as PixiText, TextStyle, FederatedPointerEvent } from "pixi.js";
import type { Bounds, Node, NodeDirection } from "../../schema";
import { startLabelEdit, type LabelEditContext } from "../interactions/labelEditor";
import { snap } from "../controls/gridSnap";
import { drawShape } from "./shapeDrawing";

const DEFAULT_NODE_COLOR = 0x888888;
const STROKE_COLOR = 0x333333;

export function getContainerBounds(container: Container): Bounds {
  return {
    x: container.position.x,
    y: container.position.y,
    width: (container as any)._nodeWidth ?? 100,
    height: (container as any)._nodeHeight ?? 100,
  };
}

export function setContainerBounds(container: Container, bounds: Bounds): void {
  container.position.set(bounds.x, bounds.y);
  (container as any)._nodeWidth = bounds.width;
  (container as any)._nodeHeight = bounds.height;
}

function colorToHex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  return parseInt(color.replace("#", ""), 16);
}

/** IDs of nodes currently being moved as part of a multi-drag. */
const groupDraggingIds = new Set<string>();

/** IDs of nodes currently being dragged (including single drag). */
const draggingIds = new Set<string>();

type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  label?: string;
  shape?: string;
  direction?: NodeDirection;
};

export interface CanvasNodeCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string) => void;
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
  callbacks: CanvasNodeCallbacks
): Container {
  const group = new Container();
  group.label = node.id;
  setContainerBounds(group, node.bounds);
  group.eventMode = "static";
  group.cursor = node.fileLink ? "pointer" : "default";

  const fillColor = colorToHex(node.nodeColor, DEFAULT_NODE_COLOR);
  const rect = new Graphics();
  rect.label = "node-rect";
  drawShape(rect, node.bounds.width, node.bounds.height, node.shape, fillColor, STROKE_COLOR, node.direction);
  (rect as any)._fillColor = fillColor;
  (rect as any)._strokeColor = STROKE_COLOR;
  (rect as any)._nodeShape = node.shape;
  (rect as any)._nodeDirection = node.direction;
  rect.eventMode = "passive";

  const textFill = node.labelColor ?? labelColor;
  const text = new PixiText({
    text: node.label || "",
    resolution: 2,
    style: new TextStyle({
      fontSize: 14,
      fontFamily: "sans-serif",
      fill: textFill,
      align: "center",
      wordWrap: true,
      wordWrapWidth: node.bounds.width,
    }),
  });
  text.label = "node-label";
  text.anchor.set(0.5, 0);
  text.x = node.bounds.width / 2;
  // Vertical centering
  text.y = Math.max(0, (node.bounds.height - text.height) / 2);
  text.eventMode = "none";

  group.addChild(rect);
  group.addChild(text);
  (group as any)._nodeDirection = node.direction;
  (group as any)._hasFileLink = !!node.fileLink;
  (group as any)._fileLinkPath = node.fileLink?.path ?? null;

  // Tooltip on linked node hover
  group.on("pointerover", () => {
    const path = (group as any)._fileLinkPath;
    if (path) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = `${path} (Ctrl+Click)`;
    }
  });
  group.on("pointerout", () => {
    if ((group as any)._fileLinkPath) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = "";
    }
  });

  const nodeId = node.id;

  // --- Click / double-click detection ---
  let pointerDownPos: { x: number; y: number } | null = null;
  let lastClickTime = 0;
  const DOUBLE_CLICK_MS = 400;
  const DRAG_THRESHOLD = 4;

  // --- Drag state ---
  let isDragging = false;
  const startPositions = new Map<string, { x: number; y: number }>();

  group.on("pointerdown", (e: FederatedPointerEvent) => {
    // In locked mode, click on linked nodes opens the file link
    if (callbacks.isLocked()) {
      if (!(group as any)._hasFileLink) return;
      e.stopPropagation();
      const onUpLocked = () => {
        group.off("pointerup", onUpLocked);
        group.off("pointerupoutside", onUpLocked);
        callbacks.onOpenFileLink(nodeId);
      };
      group.on("pointerup", onUpLocked);
      group.on("pointerupoutside", onUpLocked);
      return;
    }

    if (callbacks.isEdgeMode()) return; // Let event propagate to viewport for edge creation
    e.stopPropagation();

    const viewport = callbacks.getViewport();
    const local = viewport.toLocal(e.global);
    pointerDownPos = { x: local.x, y: local.y };
    isDragging = false;

    // Record start positions for multi-drag
    startPositions.clear();
    const selectedIds = callbacks.getSelectedNodeIds();
    if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
      for (const id of selectedIds) {
        const g = id === nodeId ? group : (viewport.getChildByLabel(id) as Container | null);
        if (g) {
          startPositions.set(id, { x: g.position.x, y: g.position.y });
          groupDraggingIds.add(id);
        }
      }
    }

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
      if (startPositions.size > 1) {
        const actualDx = group.position.x - myStart.x;
        const actualDy = group.position.y - myStart.y;
        for (const [id, start] of startPositions) {
          if (id === nodeId) continue;
          const other = viewport.getChildByLabel(id) as Container | null;
          if (other) {
            other.position.set(start.x + actualDx, start.y + actualDy);
          }
        }
      }

      callbacks.onDragUpdate();
    };

    const onUp = (ue: FederatedPointerEvent) => {
      group.off("globalpointermove", onMove);
      group.off("pointerup", onUp);
      group.off("pointerupoutside", onUp);

      if (isDragging) {
        // Commit drag
        if (startPositions.size > 1) {
          const updates: { id: string; changes: NodeChanges }[] = [];
          for (const id of startPositions.keys()) {
            const g = id === nodeId ? group : (viewport.getChildByLabel(id) as Container | null);
            if (g) {
              updates.push({ id, changes: { bounds: { x: Math.round(g.position.x), y: Math.round(g.position.y) } } });
            }
          }
          startPositions.clear();
          groupDraggingIds.clear();
          draggingIds.delete(nodeId);
          callbacks.onNodesChanged(updates);
        } else {
          startPositions.clear();
          groupDraggingIds.clear();
          draggingIds.delete(nodeId);
          callbacks.onNodeChanged(nodeId, {
            bounds: { x: Math.round(group.position.x), y: Math.round(group.position.y) },
          });
        }
      } else {
        // Click (no drag)
        groupDraggingIds.clear();
        draggingIds.delete(nodeId);
        startPositions.clear();

        const now = Date.now();
        if ((group as any)._hasFileLink && ue.ctrlKey) {
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

export function updateNodeTextResolution(group: Container, resolution: number): void {
  const text = group.getChildByLabel("node-label") as PixiText | null;
  if (text && text.resolution !== resolution) {
    text.resolution = resolution;
  }
}

export function updateCanvasNode(group: Container, node: Node, labelColor: string): void {
  if (draggingIds.has(node.id) || groupDraggingIds.has(node.id)) return;

  const rect = group.getChildByLabel("node-rect") as Graphics;
  const text = group.getChildByLabel("node-label") as PixiText;

  setContainerBounds(group, node.bounds);

  const fillColor = colorToHex(node.nodeColor, DEFAULT_NODE_COLOR);
  rect.clear();
  drawShape(rect, node.bounds.width, node.bounds.height, node.shape, fillColor, STROKE_COLOR, node.direction);
  (rect as any)._fillColor = fillColor;
  (rect as any)._strokeColor = STROKE_COLOR;
  (rect as any)._nodeShape = node.shape;
  (rect as any)._nodeDirection = node.direction;
  (group as any)._nodeDirection = node.direction;

  const textFill = node.labelColor ?? labelColor;
  text.text = node.label || "";
  text.style.fill = textFill;
  text.style.wordWrapWidth = node.bounds.width;
  text.x = node.bounds.width / 2;
  text.y = Math.max(0, (node.bounds.height - text.height) / 2);

  const hasLink = !!node.fileLink;
  group.cursor = hasLink ? "pointer" : "default";
  (group as any)._hasFileLink = hasLink;
  (group as any)._fileLinkPath = node.fileLink?.path ?? null;
}
