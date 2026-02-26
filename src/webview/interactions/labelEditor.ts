import { Application, Container, Text as PixiText } from "pixi.js";
import { getContainerBounds } from "../canvas/canvasNode";

export interface LabelEditContext {
  app: Application;
  viewport: Container;
  labelColor: string;
  onLabelChanged: (nodeId: string, label: string) => void;
  onEdgeLabelChanged: (edgeId: string, label: string) => void;
}

interface TextareaOpts {
  textNode: PixiText;
  globalPos: { x: number; y: number };
  width: number;
  height: number;
  scale: number;
  container: HTMLElement;
  labelColor: string;
  background?: string;
  border?: string;
  onCommit: (text: string) => void;
  /** Controls visibility when cancelled/committed with empty text. Default: true (always visible). */
  visibleWhenEmpty?: boolean;
}

function openTextarea(opts: TextareaOpts): void {
  const {
    textNode, globalPos, width, height, scale, container,
    labelColor, background, border, onCommit,
    visibleWhenEmpty = true,
  } = opts;

  textNode.visible = false;

  const textarea = document.createElement("textarea");
  textarea.value = textNode.text;

  Object.assign(textarea.style, {
    position: "absolute",
    top: `${globalPos.y}px`,
    left: `${globalPos.x}px`,
    width: `${width}px`,
    height: `${height}px`,
    fontSize: `${14 * scale}px`,
    fontFamily: "sans-serif",
    lineHeight: `${18 * scale}px`,
    textAlign: "center",
    border: border ?? "none",
    padding: "0",
    margin: "0",
    background: background ?? "transparent",
    color: labelColor,
    outline: "none",
    boxSizing: "border-box",
    resize: "none",
    overflow: "hidden",
  });

  const LINE_HEIGHT = 18 * scale;
  const updatePadding = () => {
    const lines = textarea.value.split("\n").length;
    const textHeight = lines * LINE_HEIGHT;
    const pad = Math.max(0, (height - textHeight) / 2);
    textarea.style.paddingTop = `${pad}px`;
  };

  container.style.position = "relative";
  container.appendChild(textarea);
  updatePadding();
  textarea.addEventListener("input", updatePadding);
  textarea.focus();
  textarea.select();

  let done = false;

  const commit = () => {
    if (done) return;
    done = true;
    const newLabel = textarea.value;
    textarea.remove();
    textNode.text = newLabel;
    textNode.visible = visibleWhenEmpty || !!newLabel;
    onCommit(newLabel);
  };

  const cancel = () => {
    if (done) return;
    done = true;
    textarea.remove();
    textNode.visible = visibleWhenEmpty || !!textNode.text;
  };

  textarea.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      cancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  textarea.addEventListener("blur", commit);
}

export function startLabelEdit(
  ctx: LabelEditContext,
  group: Container,
  nodeId: string
): void {
  const textNode = group.getChildByLabel("node-label") as PixiText;
  const { width, height } = getContainerBounds(group);

  const globalPos = group.toGlobal({ x: 0, y: 0 });
  const scale = ctx.viewport.scale.x;

  openTextarea({
    textNode,
    globalPos,
    width: width * scale,
    height: height * scale,
    scale,
    container: ctx.app.canvas.parentElement!,
    labelColor: ctx.labelColor,
    onCommit: (label) => ctx.onLabelChanged(nodeId, label),
  });
}

export function startEdgeLabelEdit(
  ctx: LabelEditContext,
  group: Container,
  edgeId: string
): void {
  const textNode = group.getChildByLabel("edge-label") as PixiText;

  const globalPos = textNode.toGlobal({ x: 0, y: 0 });
  const scale = ctx.viewport.scale.x;

  const boxWidth = 150 * scale;
  const boxHeight = 40 * scale;

  openTextarea({
    textNode,
    globalPos: { x: globalPos.x - boxWidth / 2, y: globalPos.y - boxHeight / 2 },
    width: boxWidth,
    height: boxHeight,
    scale,
    container: ctx.app.canvas.parentElement!,
    labelColor: ctx.labelColor,
    background: "rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.3)",
    visibleWhenEmpty: false,
    onCommit: (label) => ctx.onEdgeLabelChanged(edgeId, label),
  });
}
