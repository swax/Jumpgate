import { Application, Container, Text as PixiText } from "pixi.js";
import { getContainerBounds } from "../canvas/canvasNode";

export interface LabelEditContext {
  app: Application;
  viewport: Container;
  labelColor: string;
  onLabelChanged: (nodeId: string, label: string) => void;
}

export function startLabelEdit(
  ctx: LabelEditContext,
  group: Container,
  nodeId: string
): void {
  const textNode = group.getChildByLabel("node-label") as PixiText;
  const { width, height } = getContainerBounds(group);

  textNode.visible = false;

  const globalPos = group.toGlobal({ x: 0, y: 0 });
  const scale = ctx.viewport.scale.x;
  const container = ctx.app.canvas.parentElement!;

  const textarea = document.createElement("textarea");
  textarea.value = textNode.text;

  Object.assign(textarea.style, {
    position: "absolute",
    top: `${globalPos.y}px`,
    left: `${globalPos.x}px`,
    width: `${width * scale}px`,
    height: `${height * scale}px`,
    fontSize: `${14 * scale}px`,
    fontFamily: "sans-serif",
    lineHeight: `${18 * scale}px`,
    textAlign: "center",
    border: "none",
    padding: "0",
    margin: "0",
    background: "transparent",
    color: ctx.labelColor,
    outline: "none",
    boxSizing: "border-box",
    resize: "none",
    overflow: "hidden",
  });

  const LINE_HEIGHT = 18 * scale;
  const updatePadding = () => {
    const lines = textarea.value.split("\n").length;
    const textHeight = lines * LINE_HEIGHT;
    const boxHeight = height * scale;
    const pad = Math.max(0, (boxHeight - textHeight) / 2);
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
    textNode.visible = true;
    ctx.onLabelChanged(nodeId, newLabel);
  };

  const cancel = () => {
    if (done) return;
    done = true;
    textarea.remove();
    textNode.visible = true;
  };

  textarea.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      cancel();
    }
  });

  textarea.addEventListener("blur", commit);
}
