import { Application, Container, Graphics } from "pixi.js";
import type { Bounds, Edge, Node } from "../schema";
import { createCanvasNode, updateCanvasNode, updateNodeTextResolution, isDraggingNode, getContainerBounds, type CanvasNodeCallbacks } from "./canvas/canvasNode";
import { createCanvasEdge, updateCanvasEdge, updateEdgeTextResolution, resolveEndpoint } from "./canvas/canvasEdge";
import { startEdgeLabelEdit, type LabelEditContext } from "./interactions/labelEditor";
import { getNodeDepth, type EditorState } from "./state";
import { SelectionOverlay } from "./canvas/selectionOverlay";
import { EdgeHandleOverlay } from "./canvas/edgeHandleOverlay";

type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  label?: string;
  shape?: string;
  direction?: Node["direction"];
  parentId?: string | null;
};

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onEdgeChanged: (id: string, changes: Partial<Pick<Edge, "from" | "to" | "label">>) => void;
}

export function createRenderer(
  app: Application,
  viewport: Container,
  callbacks: RendererCallbacks
) {
  let prevNodeIds: Set<string> = new Set();
  let prevEdgeIds: Set<string> = new Set();
  let isLocked = false;
  let snapEnabled = true;
  let isEdgeMode = false;

  // Enable z-index sorting on the viewport
  viewport.sortableChildren = true;

  const labelColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--vscode-editor-foreground")
      .trim() || "#cccccc";

  const labelEditCtx: LabelEditContext = {
    app,
    viewport,
    labelColor,
    onLabelChanged: (nodeId, label) => callbacks.onNodeChanged(nodeId, { label }),
    onEdgeLabelChanged: (edgeId, label) => callbacks.onEdgeChanged(edgeId, { label }),
  };

  let selectedNodeIds: string[] = [];

  const selectionOverlay = new SelectionOverlay(
    () => viewport,
    {
      onNodeChanged: callbacks.onNodeChanged,
      onNodesChanged: callbacks.onNodesChanged,
      isSnapEnabled: () => snapEnabled,
      onDragUpdate: () => renderEdges(lastState),
    }
  );
  selectionOverlay.container.zIndex = 9000;
  viewport.addChild(selectionOverlay.container);

  const edgeHandleOverlay = new EdgeHandleOverlay(
    () => viewport,
    {
      onEdgeChanged: callbacks.onEdgeChanged,
      onDragMove: () => renderEdges(lastState),
    }
  );
  edgeHandleOverlay.container.zIndex = 9001;
  viewport.addChild(edgeHandleOverlay.container);

  const nodeCallbacks: CanvasNodeCallbacks = {
    onNodeChanged: callbacks.onNodeChanged,
    onNodesChanged: callbacks.onNodesChanged,
    onSelect: callbacks.onSelect,
    onOpenFileLink: callbacks.onOpenFileLink,
    getSelectedNodeIds: () => selectedNodeIds,
    isLocked: () => isLocked,
    isEdgeMode: () => isEdgeMode,
    isSnapEnabled: () => snapEnabled,
    getViewport: () => viewport,
    onDragUpdate: () => {
      if (selectedNodeIds.length > 0 && !isLocked) {
        const nodeInfos = selectedNodeIds
          .map((id) => {
            const container = viewport.getChildByLabel(id) as Container | null;
            if (!container) return null;
            return { id, ...getContainerBounds(container) };
          })
          .filter((n): n is NonNullable<typeof n> => n !== null);
        selectionOverlay.update(nodeInfos, viewport.scale.x);
      }
      // Re-render edges during drag so they follow nodes
      renderEdges(lastState);
    },
  };

  const nodeZIndexMap = new Map<string, number>();

  function computeEdgeZIndex(edge: Edge): number {
    const fromId = "nodeId" in edge.from ? edge.from.nodeId : null;
    const toId = "nodeId" in edge.to ? edge.to.nodeId : null;
    const fromZ = fromId ? nodeZIndexMap.get(fromId) : undefined;
    const toZ = toId ? nodeZIndexMap.get(toId) : undefined;

    if (fromZ !== undefined && toZ !== undefined) return Math.max(fromZ, toZ) - 0.5;
    if (fromZ !== undefined) return fromZ - 0.5;
    if (toZ !== undefined) return toZ - 0.5;
    return 8999; // free-floating: above all nodes, below overlays
  }

  let lastState: EditorState | null = null;

  // Keep text crisp during zoom by updating resolution when viewport scale changes
  let lastTextRes = 2;
  app.ticker.add(() => {
    if (!lastState) return;
    const textRes = Math.max(2, Math.ceil(viewport.scale.x * window.devicePixelRatio));
    if (textRes === lastTextRes) return;
    lastTextRes = textRes;
    for (const node of lastState.document.nodes) {
      const group = viewport.getChildByLabel(node.id) as Container | null;
      if (group) updateNodeTextResolution(group, textRes);
    }
    for (const edge of lastState.document.edges) {
      const group = viewport.getChildByLabel(edge.id) as Container | null;
      if (group) updateEdgeTextResolution(group, textRes);
    }
  });

  /** Build a nodeMap using live container positions/sizes (covers both drag and resize previews). */
  function buildNodeMap(state: EditorState): Map<string, Bounds> {
    const map = new Map<string, Bounds>();
    for (const n of state.document.nodes) {
      const container = viewport.getChildByLabel(n.id) as Container | null;
      map.set(n.id, container ? getContainerBounds(container) : n.bounds);
    }
    return map;
  }

  function renderEdges(state: EditorState | null): void {
    if (!state) return;
    const { document: doc, selectedEdgeIds } = state;
    const selectedEdgeSet = new Set(selectedEdgeIds);
    const currentEdgeIds = new Set(doc.edges.map((e) => e.id));
    const nodeMap = buildNodeMap(state);

    // Remove edges for deleted items
    for (const id of prevEdgeIds) {
      if (!currentEdgeIds.has(id)) {
        const gfx = viewport.getChildByLabel(id);
        if (gfx) {
          viewport.removeChild(gfx);
          gfx.destroy();
        }
      }
    }

    // Check for in-flight edge handle drag override
    const handleOverride = edgeHandleOverlay.getEndpointOverride();

    // Create or update edges
    for (let i = 0; i < doc.edges.length; i++) {
      const edge = doc.edges[i];
      // Apply endpoint override during handle drag
      const renderEdge = (handleOverride && edge.id === handleOverride.edgeId)
        ? { ...edge, [handleOverride.which]: handleOverride.endpoint }
        : edge;

      // Skip edges with missing node references
      const from = resolveEndpoint(renderEdge.from, nodeMap);
      const to = resolveEndpoint(renderEdge.to, nodeMap);
      if (!from || !to) continue;

      let edgeContainer = viewport.getChildByLabel(edge.id) as Container | null;
      if (!edgeContainer) {
        edgeContainer = createCanvasEdge(edge, labelColor, {
          onSelect: (edgeId) => callbacks.onEdgeSelect(edgeId),
          onDoubleClick: (edgeId, container) => {
            if (!isLocked) {
              startEdgeLabelEdit(labelEditCtx, container, edgeId);
            }
          },
        });
        viewport.addChild(edgeContainer);
      }

      edgeContainer.zIndex = (handleOverride && edge.id === handleOverride.edgeId) ? 8999 : computeEdgeZIndex(edge);
      updateCanvasEdge(edgeContainer, renderEdge, nodeMap, selectedEdgeSet.has(edge.id), viewport.scale.x, labelColor);
    }

    prevEdgeIds = currentEdgeIds;

    edgeHandleOverlay.update(
      doc.edges,
      state.selectedEdgeIds,
      nodeMap,
      viewport.scale.x,
      isLocked,
      isEdgeMode
    );
  }

  function render(state: EditorState): void {
    lastState = state;
    const { document: doc, selectedNodeIds: stateSelectedNodeIds, locked, snapToGrid, edgeMode } = state;
    selectedNodeIds = stateSelectedNodeIds;
    isLocked = locked;
    snapEnabled = snapToGrid;
    isEdgeMode = edgeMode;
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
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      let group = viewport.getChildByLabel(node.id) as Container | null;

      if (!group) {
        group = createCanvasNode(node, labelColor, labelEditCtx, nodeCallbacks);
        viewport.addChild(group);
      }

      if (!isDraggingNode(node.id)) {
        const depth = getNodeDepth(node.id);
        const textOffset = node.shape === "text" ? 500 : 0;
        group.zIndex = 1000 + depth * 1000 + textOffset + i;
      }
      nodeZIndexMap.set(node.id, group.zIndex);

      const hasFileLink = !!node.fileLink;
      group.eventMode = (isLocked && !hasFileLink) ? "none" : "static";

      if (!isDraggingNode(node.id)) {
        updateCanvasNode(group, node, labelColor);
      }
    }

    // Update text resolution for crisp rendering at current zoom
    const textRes = Math.max(2, Math.ceil(viewport.scale.x * window.devicePixelRatio));
    for (const node of doc.nodes) {
      const group = viewport.getChildByLabel(node.id) as Container | null;
      if (group) updateNodeTextResolution(group, textRes);
    }
    for (const edge of doc.edges) {
      const group = viewport.getChildByLabel(edge.id) as Container | null;
      if (group) updateEdgeTextResolution(group, textRes);
    }

    // Update selection overlay
    if (stateSelectedNodeIds.length > 0 && !locked) {
      const nodeInfos = stateSelectedNodeIds
        .map((id) => {
          const n = doc.nodes.find((n) => n.id === id);
          if (!n) return null;
          return { id: n.id, ...n.bounds };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);
      selectionOverlay.update(nodeInfos, viewport.scale.x);
    } else {
      selectionOverlay.update([], viewport.scale.x);
    }

    // Render edges
    renderEdges(state);

    prevNodeIds = currentIds;
  }

  return { render };
}
