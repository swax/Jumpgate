import Konva from "konva";
import type { Box } from "../schema";
import { createBoxNode, updateBoxNode, type BoxNodeCallbacks } from "./boxNode";
import type { LabelEditContext } from "./labelEditor";
import type { EditorState } from "./state";

export interface RendererCallbacks {
  onBoxChanged: (
    id: string,
    changes: Partial<Pick<Box, "x" | "y" | "width" | "height" | "color" | "textColor" | "label">>
  ) => void;
  onSelect: (id: string | null) => void;
}

export function createRenderer(
  stage: Konva.Stage,
  layer: Konva.Layer,
  transformer: Konva.Transformer,
  callbacks: RendererCallbacks
) {
  let prevBoxIds: Set<string> = new Set();
  let isLocked = false;

  const textColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-editor-foreground")
      .trim() || "#cccccc";

  const labelEditCtx: LabelEditContext = {
    stage,
    layer,
    textColor,
    onLabelChanged: (boxId, label) => callbacks.onBoxChanged(boxId, { label }),
  };

  const boxCallbacks: BoxNodeCallbacks = {
    onBoxChanged: callbacks.onBoxChanged,
    onSelect: callbacks.onSelect,
    isLocked: () => isLocked,
  };

  function render(state: EditorState): void {
    const { document: doc, selectedBoxId, locked } = state;
    isLocked = locked;
    const currentIds = new Set(doc.boxes.map((b) => b.id));

    // Remove nodes for deleted boxes
    for (const id of prevBoxIds) {
      if (!currentIds.has(id)) {
        const node = layer.findOne<Konva.Group>(`#${id}`);
        if (node) {
          node.destroy();
        }
      }
    }

    // Create or update nodes
    for (const box of doc.boxes) {
      let group = layer.findOne<Konva.Group>(`#${box.id}`);

      if (!group) {
        group = createBoxNode(box, textColor, labelEditCtx, boxCallbacks);
        layer.add(group);
      }

      group.draggable(!isLocked);
      updateBoxNode(group, box, textColor);
    }

    // Manage transformer
    if (selectedBoxId && !locked) {
      const selectedNode = layer.findOne<Konva.Group>(`#${selectedBoxId}`);
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
