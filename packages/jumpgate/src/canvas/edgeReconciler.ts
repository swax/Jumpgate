import { Container } from "pixi.js";
import type { Bounds, Edge } from "../schema";
import type { EditorState } from "../state";
import { createCanvasEdge, updateCanvasEdge, resolveEndpoint, buildPolylinePoints, computePolylineMidpoint, PolylineHitArea, getSegmentDragOverride, type CanvasEdgeCallbacks } from "./canvasEdge";
import { getContainerBounds } from "./canvasNode";
import type { EdgeHandleOverlay } from "./edgeHandleOverlay";
import type { DomLabelManager } from "./domLabels";
import { DEFAULT_FONT_FAMILY } from "./textDefaults";

export interface EdgeReconcilerContext {
  viewport: Container;
  edgeCallbacks: CanvasEdgeCallbacks;
  edgeHandleOverlay: EdgeHandleOverlay;
  domLabels: DomLabelManager;
  nodeZIndexMap: Map<string, number>;
  labelColor: string;
  isLocked: boolean;
  isEdgeMode: boolean;
  snapEnabled: boolean;
  prevEdgeIds: Set<string>;
}

/** Build a nodeMap using live container positions/sizes (covers both drag and resize previews). */
export function buildNodeMap(state: EditorState, viewport: Container): Map<string, Bounds> {
  const map = new Map<string, Bounds>();
  for (const n of state.document.nodes) {
    const container = viewport.getChildByLabel(n.id) as Container | null;
    map.set(n.id, container ? getContainerBounds(container) : n.bounds);
  }
  return map;
}

function computeEdgeZIndex(edge: Edge, nodeZIndexMap: Map<string, number>): number {
  const fromId = "nodeId" in edge.from ? edge.from.nodeId : null;
  const toId = "nodeId" in edge.to ? edge.to.nodeId : null;
  const fromZ = fromId ? nodeZIndexMap.get(fromId) : undefined;
  const toZ = toId ? nodeZIndexMap.get(toId) : undefined;

  if (fromZ !== undefined && toZ !== undefined) return Math.max(fromZ, toZ) - 0.5;
  if (fromZ !== undefined) return fromZ - 0.5;
  if (toZ !== undefined) return toZ - 0.5;
  return 8999; // free-floating: above all nodes, below overlays
}

export function reconcileEdges(ctx: EdgeReconcilerContext, state: EditorState): Set<string> {
  const { viewport, edgeCallbacks, edgeHandleOverlay, domLabels, nodeZIndexMap, labelColor, isLocked, isEdgeMode, snapEnabled, prevEdgeIds } = ctx;
  const { document: doc } = state;
  const selectedEdgeSet = new Set(state.selectedEdgeIds);
  const currentEdgeIds = new Set(doc.edges.map((e) => e.id));
  const nodeMap = buildNodeMap(state, viewport);

  // Remove edges for deleted items
  for (const id of prevEdgeIds) {
    if (!currentEdgeIds.has(id)) {
      const gfx = viewport.getChildByLabel(id);
      if (gfx) {
        viewport.removeChild(gfx);
        gfx.destroy();
      }
      domLabels.removeLabel(id);
    }
  }

  // Check for in-flight edge handle drag overrides
  const handleOverride = edgeHandleOverlay.getEndpointOverride();
  const wpOverride = edgeHandleOverlay.getWaypointOverrides();
  const segOverride = getSegmentDragOverride();

  // Create or update edges
  for (let i = 0; i < doc.edges.length; i++) {
    const edge = doc.edges[i];
    // Apply endpoint override during handle drag
    let renderEdge = (handleOverride && edge.id === handleOverride.edgeId)
      ? { ...edge, [handleOverride.which]: handleOverride.endpoint }
      : edge;

    // Apply waypoint override during waypoint drag
    if (wpOverride && edge.id === wpOverride.edgeId) {
      renderEdge = { ...renderEdge, waypoints: wpOverride.waypoints };
    }

    // Apply segment drag override
    if (segOverride && edge.id === segOverride.edgeId) {
      renderEdge = { ...renderEdge,
        ...(segOverride.from && { from: segOverride.from }),
        ...(segOverride.to && { to: segOverride.to }),
        ...(segOverride.waypoints !== undefined && { waypoints: segOverride.waypoints }),
      };
    }

    // Skip edges with missing node references
    const from = resolveEndpoint(renderEdge.from, nodeMap);
    const to = resolveEndpoint(renderEdge.to, nodeMap);
    if (!from || !to) continue;

    let edgeContainer = viewport.getChildByLabel(edge.id) as Container | null;
    if (!edgeContainer) {
      edgeContainer = createCanvasEdge(edge, labelColor, edgeCallbacks, doc.theme);
      viewport.addChild(edgeContainer);
    }

    edgeContainer.zIndex = ((handleOverride && edge.id === handleOverride.edgeId) || (segOverride && edge.id === segOverride.edgeId)) ? 8999 : computeEdgeZIndex(edge, nodeZIndexMap);

    const edgeGfx = edgeContainer.getChildByLabel("edge-line");
    if (edgeGfx) {
      edgeGfx.eventMode = "static";
    }

    updateCanvasEdge(edgeContainer, renderEdge, nodeMap, selectedEdgeSet.has(edge.id), viewport.scale.x, labelColor, doc.theme, isLocked);

    // Upsert DOM label for this edge
    const points = buildPolylinePoints(from, to, renderEdge.waypoints);
    const mid = computePolylineMidpoint(points);
    const isSpace = doc.theme === "space";
    const edgeFontFamily = isSpace ? "Consolas, 'Courier New', monospace" : DEFAULT_FONT_FAMILY;
    const edgeLabelColor = edge.labelColor ?? labelColor;
    domLabels.upsertEdgeLabel(edge.id, edge.label || "", edgeLabelColor, edgeFontFamily, mid.x, mid.y, isSpace);

    // Expand edge hit area to include the label bounding box
    if (edge.label && edgeGfx) {
      const labelEl = domLabels.getElement(edge.id);
      if (labelEl && edgeGfx.hitArea instanceof PolylineHitArea) {
        const zoom = viewport.scale.x;
        const worldW = labelEl.offsetWidth / zoom;
        const worldH = labelEl.offsetHeight / zoom;
        edgeGfx.hitArea.labelRect = {
          x: mid.x - worldW / 2,
          y: mid.y - worldH / 2,
          width: worldW,
          height: worldH,
        };
      }
    }
  }

  edgeHandleOverlay.update(
    doc.edges,
    state.selectedEdgeIds,
    nodeMap,
    viewport.scale.x,
    isLocked,
    isEdgeMode
  );

  return currentEdgeIds;
}
