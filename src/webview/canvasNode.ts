import Konva from "konva";
import type { Node } from "../schema";
import { startLabelEdit, type LabelEditContext } from "./labelEditor";
import { snap, GRID_SIZE } from "./gridSnap";

const DEFAULT_NODE_COLOR = "#888888";

/** IDs of nodes currently being moved as part of a multi-drag. */
const groupDraggingIds = new Set<string>();

type NodeChanges = Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>;

export interface CanvasNodeCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  getSelectedNodeIds: () => string[];
  isLocked: () => boolean;
  isSnapEnabled: () => boolean;
}

export function createCanvasNode(
  node: Node,
  labelColor: string,
  labelEditCtx: LabelEditContext,
  callbacks: CanvasNodeCallbacks
): Konva.Group {
  const group = new Konva.Group({
    id: node.id,
    x: node.x,
    y: node.y,
    draggable: true,
  });

  const rect = new Konva.Rect({
    name: "node-rect",
    width: node.width,
    height: node.height,
    fill: node.nodeColor ?? DEFAULT_NODE_COLOR,
    strokeWidth: 2,
    stroke: "#333333",
  });

  const text = new Konva.Text({
    name: "node-label",
    text: node.label || "",
    width: node.width,
    height: node.height,
    align: "center",
    verticalAlign: "middle",
    fontSize: 14,
    fontFamily: "sans-serif",
    fill: node.labelColor ?? labelColor,
    listening: false,
  });

  group.add(rect);
  group.add(text);

  const nodeId = node.id;

  group.on("click tap", (e) => {
    if (callbacks.isLocked()) return;
    e.cancelBubble = true;
    callbacks.onSelect(nodeId, e.evt.shiftKey);
  });

  group.on("dblclick dbltap", () => {
    if (callbacks.isLocked()) return;
    startLabelEdit(labelEditCtx, group, nodeId);
  });

  // Absolute start positions for all nodes in a multi-drag
  const startPositions = new Map<string, { x: number; y: number }>();

  group.on("dragstart", () => {
    const selectedIds = callbacks.getSelectedNodeIds();
    startPositions.clear();
    if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
      const layer = group.getLayer();
      if (layer) {
        for (const id of selectedIds) {
          const g = id === nodeId ? group : layer.findOne<Konva.Group>(`#${id}`);
          if (g) {
            startPositions.set(id, { x: g.x(), y: g.y() });
            groupDraggingIds.add(id);
          }
        }
      }
    }
  });

  group.on("dragmove", () => {
    if (callbacks.isSnapEnabled()) {
      group.x(snap(group.x()));
      group.y(snap(group.y()));
    }

    const myStart = startPositions.get(nodeId);
    if (!myStart || startPositions.size <= 1) return;

    // Compute total delta from start — no accumulation drift
    const dx = group.x() - myStart.x;
    const dy = group.y() - myStart.y;

    const layer = group.getLayer();
    if (!layer) return;

    for (const [id, start] of startPositions) {
      if (id === nodeId) continue;
      const other = layer.findOne<Konva.Group>(`#${id}`);
      if (other) {
        other.x(start.x + dx);
        other.y(start.y + dy);
      }
    }
  });

  group.on("dragend", () => {
    if (startPositions.size > 1) {
      // Batch-update all moved nodes in one state change → one render
      const layer = group.getLayer();
      const updates: { id: string; changes: NodeChanges }[] = [];
      if (layer) {
        for (const id of startPositions.keys()) {
          const g = id === nodeId ? group : layer.findOne<Konva.Group>(`#${id}`);
          if (g) {
            updates.push({ id, changes: { x: Math.round(g.x()), y: Math.round(g.y()) } });
          }
        }
      }
      startPositions.clear();
      groupDraggingIds.clear();
      callbacks.onNodesChanged(updates);
    } else {
      groupDraggingIds.clear();
      callbacks.onNodeChanged(nodeId, {
        x: Math.round(group.x()),
        y: Math.round(group.y()),
      });
    }
  });

  group.on("transformend", () => {
    const r = group.findOne<Konva.Rect>(".node-rect")!;
    const t = group.findOne<Konva.Text>(".node-label")!;
    const scaleX = group.scaleX();
    const scaleY = group.scaleY();
    let newWidth = Math.round(r.width() * scaleX);
    let newHeight = Math.round(r.height() * scaleY);
    let newX = Math.round(group.x());
    let newY = Math.round(group.y());
    if (callbacks.isSnapEnabled()) {
      newWidth = Math.max(GRID_SIZE, snap(newWidth));
      newHeight = Math.max(GRID_SIZE, snap(newHeight));
      newX = snap(newX);
      newY = snap(newY);
    }
    group.scaleX(1);
    group.scaleY(1);
    r.width(newWidth);
    r.height(newHeight);
    t.width(newWidth);
    t.height(newHeight);
    group.x(newX);
    group.y(newY);
    callbacks.onNodeChanged(nodeId, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
  });

  return group;
}

export function updateCanvasNode(group: Konva.Group, node: Node, labelColor: string): void {
  if (group.isDragging() || groupDraggingIds.has(group.id())) return;

  const rect = group.findOne<Konva.Rect>(".node-rect")!;
  const text = group.findOne<Konva.Text>(".node-label")!;
  group.setAttrs({ x: node.x, y: node.y });
  rect.setAttrs({
    width: node.width,
    height: node.height,
    fill: node.nodeColor ?? DEFAULT_NODE_COLOR,
  });
  text.setAttrs({
    text: node.label || "",
    width: node.width,
    height: node.height,
    fill: node.labelColor ?? labelColor,
  });
}
