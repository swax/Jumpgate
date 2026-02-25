import { Application, Container } from "pixi.js";
import type { Node } from "../schema";
import { createCanvasNode, updateCanvasNode, isDraggingNode, type CanvasNodeCallbacks } from "./canvasNode";
import type { LabelEditContext } from "./labelEditor";
import type { EditorState } from "./state";
import { SelectionOverlay } from "./selectionOverlay";

type NodeChanges = Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>;

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
}

export function createRenderer(
  app: Application,
  viewport: Container,
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
    app,
    viewport,
    labelColor,
    onLabelChanged: (nodeId, label) => callbacks.onNodeChanged(nodeId, { label }),
  };

  let selectedNodeIds: string[] = [];

  const selectionOverlay = new SelectionOverlay(
    () => viewport,
    {
      onNodeChanged: callbacks.onNodeChanged,
      onNodesChanged: callbacks.onNodesChanged,
      isSnapEnabled: () => snapEnabled,
    }
  );
  viewport.addChild(selectionOverlay.container);

  const nodeCallbacks: CanvasNodeCallbacks = {
    onNodeChanged: callbacks.onNodeChanged,
    onNodesChanged: callbacks.onNodesChanged,
    onSelect: callbacks.onSelect,
    getSelectedNodeIds: () => selectedNodeIds,
    isLocked: () => isLocked,
    isSnapEnabled: () => snapEnabled,
    getViewport: () => viewport,
    onDragUpdate: () => {
      if (selectedNodeIds.length > 0 && !isLocked) {
        const nodeInfos = selectedNodeIds
          .map((id) => {
            const container = viewport.getChildByLabel(id) as Container | null;
            if (!container) return null;
            return {
              id,
              x: container.position.x,
              y: container.position.y,
              width: (container as any)._nodeWidth ?? 100,
              height: (container as any)._nodeHeight ?? 100,
            };
          })
          .filter((n): n is NonNullable<typeof n> => n !== null);
        selectionOverlay.update(nodeInfos, viewport.scale.x);
      }
    },
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
        const node = viewport.getChildByLabel(id);
        if (node) {
          viewport.removeChild(node);
          node.destroy();
        }
      }
    }

    // Create or update nodes
    for (const node of doc.nodes) {
      let group = viewport.getChildByLabel(node.id) as Container | null;

      if (!group) {
        group = createCanvasNode(node, labelColor, labelEditCtx, nodeCallbacks);
        // Insert before selection overlay so overlay renders on top
        const overlayIndex = viewport.getChildIndex(selectionOverlay.container);
        viewport.addChildAt(group, overlayIndex);
      }

      group.eventMode = isLocked ? "none" : "static";
      group.cursor = isLocked ? "default" : "pointer";

      if (!isDraggingNode(node.id)) {
        updateCanvasNode(group, node, labelColor);
      }
    }

    // Update selection overlay
    if (stateSelectedNodeIds.length > 0 && !locked) {
      const nodeInfos = stateSelectedNodeIds
        .map((id) => {
          const n = doc.nodes.find((n) => n.id === id);
          if (!n) return null;
          return { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);
      selectionOverlay.update(nodeInfos, viewport.scale.x);
    } else {
      selectionOverlay.update([], viewport.scale.x);
    }

    prevNodeIds = currentIds;
  }

  return { render };
}
