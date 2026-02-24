import Konva from "konva";
import type { Box } from "../schema";
import type { EditorState } from "./state";

const DEFAULT_COLOR = "#888888";

export interface RendererCallbacks {
  onBoxChanged: (
    id: string,
    changes: Partial<Pick<Box, "x" | "y" | "width" | "height">>
  ) => void;
  onSelect: (id: string | null) => void;
}

export function createRenderer(
  layer: Konva.Layer,
  transformer: Konva.Transformer,
  callbacks: RendererCallbacks
) {
  let prevBoxIds: Set<string> = new Set();

  function render(state: EditorState): void {
    const { document, selectedBoxId } = state;
    const currentIds = new Set(document.boxes.map((b) => b.id));

    // Remove nodes for deleted boxes
    for (const id of prevBoxIds) {
      if (!currentIds.has(id)) {
        const node = layer.findOne<Konva.Rect>(`#${id}`);
        if (node) {
          node.destroy();
        }
      }
    }

    // Create or update nodes
    for (const box of document.boxes) {
      let rect = layer.findOne<Konva.Rect>(`#${box.id}`);

      if (!rect) {
        rect = new Konva.Rect({
          id: box.id,
          draggable: true,
          strokeWidth: 2,
          stroke: "var(--vscode-editor-foreground)",
        });

        rect.on("click tap", (e) => {
          e.cancelBubble = true;
          callbacks.onSelect(box.id);
        });

        rect.on("dragend", () => {
          callbacks.onBoxChanged(box.id, {
            x: Math.round(rect!.x()),
            y: Math.round(rect!.y()),
          });
        });

        rect.on("transformend", () => {
          const scaleX = rect!.scaleX();
          const scaleY = rect!.scaleY();
          callbacks.onBoxChanged(box.id, {
            x: Math.round(rect!.x()),
            y: Math.round(rect!.y()),
            width: Math.round(rect!.width() * scaleX),
            height: Math.round(rect!.height() * scaleY),
          });
          rect!.scaleX(1);
          rect!.scaleY(1);
        });

        layer.add(rect);
      }

      // Skip updating nodes that are being dragged
      if (!rect.isDragging()) {
        rect.setAttrs({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          fill: box.color ?? DEFAULT_COLOR,
        });
      }
    }

    // Manage transformer
    if (selectedBoxId) {
      const selectedNode = layer.findOne<Konva.Rect>(`#${selectedBoxId}`);
      if (selectedNode) {
        transformer.nodes([selectedNode]);
      } else {
        transformer.nodes([]);
      }
    } else {
      transformer.nodes([]);
    }

    prevBoxIds = currentIds;
    layer.batchDraw();
  }

  return { render };
}
