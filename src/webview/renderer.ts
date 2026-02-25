import Konva from "konva";
import type { Node } from "../schema";
import { createCanvasNode, updateCanvasNode, type CanvasNodeCallbacks } from "./canvasNode";
import type { LabelEditContext } from "./labelEditor";
import type { EditorState } from "./state";

type NodeChanges = Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>;

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
}

export function createRenderer(
  stage: Konva.Stage,
  layer: Konva.Layer,
  transformer: Konva.Transformer,
  callbacks: RendererCallbacks
) {
  let prevNodeIds: Set<string> = new Set();
  let isLocked = false;
  let snapEnabled = true;

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

  let selectedNodeIds: string[] = [];

  const nodeCallbacks: CanvasNodeCallbacks = {
    onNodeChanged: callbacks.onNodeChanged,
    onNodesChanged: callbacks.onNodesChanged,
    onSelect: callbacks.onSelect,
    getSelectedNodeIds: () => selectedNodeIds,
    isLocked: () => isLocked,
    isSnapEnabled: () => snapEnabled,
  };

  function render(state: EditorState): void {
    const { document: doc, selectedNodeIds: stateSelectedNodeIds, locked, snapToGrid } = state;
    selectedNodeIds = stateSelectedNodeIds;
    isLocked = locked;
    snapEnabled = snapToGrid;
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
    if (stateSelectedNodeIds.length > 0 && !locked) {
      const selectedNodes = stateSelectedNodeIds
        .map((id) => layer.findOne<Konva.Group>(`#${id}`))
        .filter((n): n is Konva.Group => n !== undefined);
      transformer.nodes(selectedNodes);
    } else {
      transformer.nodes([]);
    }

    prevNodeIds = currentIds;
    layer.batchDraw();
  }

  return { render };
}
