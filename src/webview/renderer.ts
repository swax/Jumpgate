import Konva from "konva";
import type { Node } from "../schema";
import { createCanvasNode, updateCanvasNode, type CanvasNodeCallbacks } from "./canvasNode";
import type { LabelEditContext } from "./labelEditor";
import type { EditorState } from "./state";

export interface RendererCallbacks {
  onNodeChanged: (
    id: string,
    changes: Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>
  ) => void;
  onSelect: (id: string | null) => void;
}

export function createRenderer(
  stage: Konva.Stage,
  layer: Konva.Layer,
  transformer: Konva.Transformer,
  callbacks: RendererCallbacks
) {
  let prevNodeIds: Set<string> = new Set();
  let isLocked = false;

  const labelColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-editor-foreground")
      .trim() || "#cccccc";

  const labelEditCtx: LabelEditContext = {
    stage,
    layer,
    labelColor,
    onLabelChanged: (nodeId, label) => callbacks.onNodeChanged(nodeId, { label }),
  };

  const nodeCallbacks: CanvasNodeCallbacks = {
    onNodeChanged: callbacks.onNodeChanged,
    onSelect: callbacks.onSelect,
    isLocked: () => isLocked,
  };

  function render(state: EditorState): void {
    const { document: doc, selectedNodeId, locked } = state;
    isLocked = locked;
    const currentIds = new Set(doc.nodes.map((n) => n.id));

    // Remove nodes for deleted items
    for (const id of prevNodeIds) {
      if (!currentIds.has(id)) {
        const node = layer.findOne<Konva.Group>(`#${id}`);
        if (node) {
          node.destroy();
        }
      }
    }

    // Create or update nodes
    for (const node of doc.nodes) {
      let group = layer.findOne<Konva.Group>(`#${node.id}`);

      if (!group) {
        group = createCanvasNode(node, labelColor, labelEditCtx, nodeCallbacks);
        layer.add(group);
      }

      group.draggable(!isLocked);
      updateCanvasNode(group, node, labelColor);
    }

    // Manage transformer
    if (selectedNodeId && !locked) {
      const selectedNode = layer.findOne<Konva.Group>(`#${selectedNodeId}`);
      if (selectedNode) {
        transformer.nodes([selectedNode]);
      } else {
        transformer.nodes([]);
      }
    } else {
      transformer.nodes([]);
    }

    prevNodeIds = currentIds;
    layer.batchDraw();
  }

  return { render };
}
