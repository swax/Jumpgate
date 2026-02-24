import Konva from "konva";
import type { Node } from "../schema";
import { startLabelEdit, type LabelEditContext } from "./labelEditor";

const DEFAULT_NODE_COLOR = "#888888";

export interface CanvasNodeCallbacks {
  onNodeChanged: (
    id: string,
    changes: Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>
  ) => void;
  onSelect: (id: string) => void;
  isLocked: () => boolean;
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
    callbacks.onSelect(nodeId);
  });

  group.on("dblclick dbltap", () => {
    if (callbacks.isLocked()) return;
    startLabelEdit(labelEditCtx, group, nodeId);
  });

  group.on("dragend", () => {
    callbacks.onNodeChanged(nodeId, {
      x: Math.round(group.x()),
      y: Math.round(group.y()),
    });
  });

  group.on("transformend", () => {
    const r = group.findOne<Konva.Rect>(".node-rect")!;
    const t = group.findOne<Konva.Text>(".node-label")!;
    const scaleX = group.scaleX();
    const scaleY = group.scaleY();
    const newWidth = Math.round(r.width() * scaleX);
    const newHeight = Math.round(r.height() * scaleY);
    group.scaleX(1);
    group.scaleY(1);
    r.width(newWidth);
    r.height(newHeight);
    t.width(newWidth);
    t.height(newHeight);
    callbacks.onNodeChanged(nodeId, {
      x: Math.round(group.x()),
      y: Math.round(group.y()),
      width: newWidth,
      height: newHeight,
    });
  });

  return group;
}

export function updateCanvasNode(group: Konva.Group, node: Node, labelColor: string): void {
  if (group.isDragging()) return;

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
