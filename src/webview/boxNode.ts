import Konva from "konva";
import type { Box } from "../schema";
import { startLabelEdit, type LabelEditContext } from "./labelEditor";

const DEFAULT_COLOR = "#888888";

export interface BoxNodeCallbacks {
  onBoxChanged: (
    id: string,
    changes: Partial<Pick<Box, "x" | "y" | "width" | "height" | "color" | "textColor" | "label">>
  ) => void;
  onSelect: (id: string) => void;
  isLocked: () => boolean;
}

export function createBoxNode(
  box: Box,
  textColor: string,
  labelEditCtx: LabelEditContext,
  callbacks: BoxNodeCallbacks
): Konva.Group {
  const group = new Konva.Group({
    id: box.id,
    x: box.x,
    y: box.y,
    draggable: true,
  });

  const rect = new Konva.Rect({
    name: "box-rect",
    width: box.width,
    height: box.height,
    fill: box.color ?? DEFAULT_COLOR,
    strokeWidth: 2,
    stroke: "#333333",
  });

  const text = new Konva.Text({
    name: "box-label",
    text: box.label || "",
    width: box.width,
    height: box.height,
    align: "center",
    verticalAlign: "middle",
    fontSize: 14,
    fontFamily: "sans-serif",
    fill: box.textColor ?? textColor,
    listening: false,
  });

  group.add(rect);
  group.add(text);

  const boxId = box.id;

  group.on("click tap", (e) => {
    if (callbacks.isLocked()) return;
    e.cancelBubble = true;
    callbacks.onSelect(boxId);
  });

  group.on("dblclick dbltap", () => {
    if (callbacks.isLocked()) return;
    startLabelEdit(labelEditCtx, group, boxId);
  });

  group.on("dragend", () => {
    callbacks.onBoxChanged(boxId, {
      x: Math.round(group.x()),
      y: Math.round(group.y()),
    });
  });

  group.on("transformend", () => {
    const r = group.findOne<Konva.Rect>(".box-rect")!;
    const t = group.findOne<Konva.Text>(".box-label")!;
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
    callbacks.onBoxChanged(boxId, {
      x: Math.round(group.x()),
      y: Math.round(group.y()),
      width: newWidth,
      height: newHeight,
    });
  });

  return group;
}

export function updateBoxNode(group: Konva.Group, box: Box, textColor: string): void {
  if (group.isDragging()) return;

  const rect = group.findOne<Konva.Rect>(".box-rect")!;
  const text = group.findOne<Konva.Text>(".box-label")!;
  group.setAttrs({ x: box.x, y: box.y });
  rect.setAttrs({
    width: box.width,
    height: box.height,
    fill: box.color ?? DEFAULT_COLOR,
  });
  text.setAttrs({
    text: box.label || "",
    width: box.width,
    height: box.height,
    fill: box.textColor ?? textColor,
  });
}
