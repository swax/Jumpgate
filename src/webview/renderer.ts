import { Application, Container } from "pixi.js";
import type { Edge } from "../schema";
import type { NodeChanges } from "./shared";
import { createCanvasNode, updateCanvasNode, isDraggingNode, getContainerBounds, type CanvasNodeCallbacks } from "./canvas/canvasNode";
import { resolveEndpoint, buildPolylinePoints, pointToSegmentDistance, type CanvasEdgeCallbacks } from "./canvas/canvasEdge";
import { startEdgeLabelEdit, type LabelEditContext } from "./interactions/labelEditor";
import { getNodeDepth, getNodeById, getChildNodeIds, getEdgeById, type EditorState } from "./state";
import { snap } from "./controls/gridSnap";
import { SelectionOverlay } from "./canvas/selectionOverlay";
import { EdgeHandleOverlay } from "./canvas/edgeHandleOverlay";
import { DomLabelManager } from "./canvas/domLabels";
import { DEFAULT_FONT_FAMILY } from "./canvas/textDefaults";
import { SelectionGlowManager } from "./canvas/selectionGlow";
import { reconcileEdges, buildNodeMap } from "./canvas/edgeReconciler";

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string, kind: "node" | "edge", preview?: boolean) => void;
  onEdgeSelect: (edgeId: string) => void;
  onEdgeChanged: (id: string, changes: Partial<Pick<Edge, "from" | "to" | "label" | "waypoints">>) => void;
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

  const domLabels = new DomLabelManager(app.canvas.parentElement!);

  const labelEditCtx: LabelEditContext = {
    app,
    viewport,
    labelColor,
    domLabels,
    onLabelChanged: (nodeId, label) => callbacks.onNodeChanged(nodeId, { label }),
    onEdgeLabelChanged: (edgeId, label) => callbacks.onEdgeChanged(edgeId, { label }),
  };

  let selectedNodeIds: string[] = [];
  let selectedEdgeIds: string[] = [];

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
    onOpenFileLink: (id, preview) => callbacks.onOpenFileLink(id, "node", preview),
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
        selectionOverlay.update(nodeInfos, viewport.scale.x, lastState?.document.theme);

        // Update DOM label world positions from live container bounds
        for (const info of nodeInfos) {
          domLabels.updateWorldPosition(info.id, info.x, info.y, info.width, info.height);
        }
      }
      // Re-render edges during drag so they follow nodes
      renderEdges(lastState);
    },
  };

  const edgeCallbacks: CanvasEdgeCallbacks = {
    onSelect: (edgeId) => callbacks.onEdgeSelect(edgeId),
    onOpenFileLink: (edgeId, preview) => callbacks.onOpenFileLink(edgeId, "edge", preview),
    isLocked: () => isLocked,
    isEdgeMode: () => isEdgeMode,
    getSelectedEdgeIds: () => selectedEdgeIds,
    onDragUpdate: () => renderEdges(lastState),
    onEdgeChanged: callbacks.onEdgeChanged,
    getViewport: () => viewport,
    onDoubleClick: (edgeId, container, worldPos, ctrlKey) => {
      if (isLocked) return;

      // Ctrl+double-click: insert a waypoint at the clicked segment
      if (ctrlKey && worldPos) {
        const currentEdge = getEdgeById(edgeId);
        if (!currentEdge) return;

        const nodeMap = buildNodeMap(lastState!, viewport);
        const from = resolveEndpoint(currentEdge.from, nodeMap);
        const to = resolveEndpoint(currentEdge.to, nodeMap);
        if (from && to) {
          const pts = buildPolylinePoints(from, to, currentEdge.waypoints);
          let bestDist = Infinity;
          let bestIdx = 0;
          for (let s = 1; s < pts.length; s++) {
            const d = pointToSegmentDistance(
              worldPos.x, worldPos.y,
              pts[s - 1].x, pts[s - 1].y,
              pts[s].x, pts[s].y
            );
            if (d < bestDist) {
              bestDist = d;
              bestIdx = s - 1;
            }
          }

          const sx = snapEnabled ? snap(worldPos.x) : worldPos.x;
          const sy = snapEnabled ? snap(worldPos.y) : worldPos.y;

          edgeHandleOverlay.insertWaypoint(edgeId, bestIdx, { x: sx, y: sy });
          return;
        }
      }

      // Plain double-click: edit label
      startEdgeLabelEdit(labelEditCtx, container, edgeId);
    },
  };

  const nodeZIndexMap = new Map<string, number>();

  const glowManager = new SelectionGlowManager(viewport);

  let lastState: EditorState | null = null;

  // Sync DOM label positions + pulse glow every frame
  app.ticker.add((ticker) => {
    if (!lastState) return;
    const zoom = viewport.scale.x;
    const vpX = viewport.position.x;
    const vpY = viewport.position.y;
    domLabels.syncPositions(zoom, vpX, vpY);

    // Pulse glow alpha for selected items in locked mode
    if (isLocked) {
      glowManager.pulse(ticker.deltaMS, lastState.selectedEdgeIds, viewport);
    }
  });

  function renderEdges(state: EditorState | null): void {
    if (!state) return;
    prevEdgeIds = reconcileEdges({
      viewport,
      edgeCallbacks,
      edgeHandleOverlay,
      domLabels,
      nodeZIndexMap,
      labelColor,
      isLocked,
      isEdgeMode,
      snapEnabled,
      prevEdgeIds,
    }, state);
  }

  function render(state: EditorState): void {
    lastState = state;
    const { document: doc, selectedNodeIds: stateSelectedNodeIds, locked, snapToGrid, edgeMode } = state;
    selectedNodeIds = stateSelectedNodeIds;
    selectedEdgeIds = state.selectedEdgeIds;
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
        domLabels.removeLabel(id);
      }
    }

    // Create or update nodes
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      let group = viewport.getChildByLabel(node.id) as Container | null;

      if (!group) {
        group = createCanvasNode(node, labelColor, labelEditCtx, nodeCallbacks, doc.theme);
        viewport.addChild(group);
      }

      if (!isDraggingNode(node.id)) {
        const depth = getNodeDepth(node.id);
        const textOffset = node.shape === "text" ? 500 : 0;
        group.zIndex = 1000 + depth * 1000 + textOffset + i;
      }
      nodeZIndexMap.set(node.id, group.zIndex);

      group.eventMode = "static";

      if (!isDraggingNode(node.id)) {
        updateCanvasNode(group, node, labelColor, doc.theme);
      }

      // Upsert DOM label for this node
      const isSpace = doc.theme === "space";
      const hasChildren = getChildNodeIds(node.id).length > 0;
      const textFill = node.labelColor ?? labelColor;
      const fontFamily = isSpace ? "Consolas, 'Courier New', monospace" : DEFAULT_FONT_FAMILY;
      domLabels.upsertNodeLabel(
        node.id,
        node.label || "",
        textFill,
        fontFamily,
        node.bounds.x,
        node.bounds.y,
        node.bounds.width,
        node.bounds.height,
        hasChildren,
        isSpace
      );
    }

    // Update selection visuals
    if (locked) {
      // Locked mode: glow behind selected nodes (no overlay)
      selectionOverlay.update([], viewport.scale.x, doc.theme);
      glowManager.update(stateSelectedNodeIds, state.selectedEdgeIds, true, nodeZIndexMap, doc.theme);
    } else {
      // Edit mode: dashed overlay + resize handles
      glowManager.update([], [], false, nodeZIndexMap);
      if (stateSelectedNodeIds.length > 0) {
        const nodeInfos = stateSelectedNodeIds
          .map((id) => {
            const n = getNodeById(id);
            if (!n) return null;
            return { id: n.id, ...n.bounds };
          })
          .filter((n): n is NonNullable<typeof n> => n !== null);
        selectionOverlay.update(nodeInfos, viewport.scale.x, doc.theme);
      } else {
        selectionOverlay.update([], viewport.scale.x, doc.theme);
      }
    }

    // Render edges
    renderEdges(state);

    prevNodeIds = currentIds;
  }

  return { render };
}
