import { Application, Container, Graphics } from "pixi.js";
import type { Bounds, Edge, Node } from "../schema";
import { createCanvasNode, updateCanvasNode, updateNodeTextResolution, isDraggingNode, getContainerBounds, type CanvasNodeCallbacks } from "./canvas/canvasNode";
import { createCanvasEdge, updateCanvasEdge, resolveEndpoint } from "./canvas/canvasEdge";
import type { LabelEditContext } from "./interactions/labelEditor";
import type { EditorState } from "./state";
import { SelectionOverlay } from "./canvas/selectionOverlay";
import { EdgeHandleOverlay } from "./canvas/edgeHandleOverlay";

type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  label?: string;
  shape?: string;
  direction?: Node["direction"];
};

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onEdgeChanged: (id: string, changes: Partial<Pick<Edge, "from" | "to">>) => void;
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

  // Edge layer sits at the bottom of the viewport
  const edgeLayer = new Container();
  edgeLayer.label = "__edge-layer";
  viewport.addChildAt(edgeLayer, 0);

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
      onDragUpdate: () => renderEdges(lastState),
    }
  );
  viewport.addChild(selectionOverlay.container);

  const edgeHandleOverlay = new EdgeHandleOverlay(
    () => viewport,
    {
      onEdgeChanged: callbacks.onEdgeChanged,
      onDragMove: () => renderEdges(lastState),
    }
  );
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
        const gfx = edgeLayer.getChildByLabel(id);
        if (gfx) {
          edgeLayer.removeChild(gfx);
          gfx.destroy();
        }
      }
    }

    // Check for in-flight edge handle drag override
    const handleOverride = edgeHandleOverlay.getEndpointOverride();

    // Create or update edges
    for (const edge of doc.edges) {
      // Apply endpoint override during handle drag
      const renderEdge = (handleOverride && edge.id === handleOverride.edgeId)
        ? { ...edge, [handleOverride.which]: handleOverride.endpoint }
        : edge;

      // Skip edges with missing node references
      const from = resolveEndpoint(renderEdge.from, nodeMap);
      const to = resolveEndpoint(renderEdge.to, nodeMap);
      if (!from || !to) continue;

      let gfx = edgeLayer.getChildByLabel(edge.id) as Graphics | null;
      if (!gfx) {
        gfx = createCanvasEdge(edge, {
          onSelect: (edgeId) => callbacks.onEdgeSelect(edgeId),
        });
        edgeLayer.addChild(gfx);
      }

      updateCanvasEdge(gfx, renderEdge, nodeMap, selectedEdgeSet.has(edge.id), viewport.scale.x);
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
    for (const node of doc.nodes) {
      let group = viewport.getChildByLabel(node.id) as Container | null;

      if (!group) {
        group = createCanvasNode(node, labelColor, labelEditCtx, nodeCallbacks);
        // Insert before selection overlay so overlay renders on top
        const overlayIndex = viewport.getChildIndex(selectionOverlay.container);
        viewport.addChildAt(group, overlayIndex);
      }

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
