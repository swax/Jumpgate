import Konva from "konva";

export interface LabelEditContext {
  stage: Konva.Stage;
  layer: Konva.Layer;
  labelColor: string;
  onLabelChanged: (nodeId: string, label: string) => void;
}

export function startLabelEdit(
  ctx: LabelEditContext,
  group: Konva.Group,
  nodeId: string
): void {
  const rect = group.findOne<Konva.Rect>(".node-rect")!;
  const textNode = group.findOne<Konva.Text>(".node-label")!;

  textNode.hide();
  ctx.layer.batchDraw();

  const absPos = group.getAbsolutePosition();
  const scale = ctx.stage.scaleX();
  const container = ctx.stage.container();

  const textarea = document.createElement("textarea");
  textarea.value = textNode.text();

  Object.assign(textarea.style, {
    position: "absolute",
    top: `${absPos.y}px`,
    left: `${absPos.x}px`,
    width: `${rect.width() * scale}px`,
    height: `${rect.height() * scale}px`,
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
    const boxHeight = rect.height() * scale;
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
    textNode.text(newLabel);
    textNode.show();
    ctx.layer.batchDraw();
    ctx.onLabelChanged(nodeId, newLabel);
  };

  const cancel = () => {
    if (done) return;
    done = true;
    textarea.remove();
    textNode.show();
    ctx.layer.batchDraw();
  };

  textarea.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      cancel();
    }
  });

  textarea.addEventListener("blur", commit);
}
