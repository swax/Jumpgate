import { Application, Container, Graphics } from "pixi.js";
import type { Bounds, Edge, Node } from "../schema";
import type { NodeChanges } from "./shared";
import { createCanvasNode, updateCanvasNode, isDraggingNode, getContainerBounds, type CanvasNodeCallbacks } from "./canvas/canvasNode";
import { createCanvasEdge, updateCanvasEdge, resolveEndpoint, buildPolylinePoints, computePolylineMidpoint, pointToSegmentDistance, PolylineHitArea } from "./canvas/canvasEdge";
import { startEdgeLabelEdit, type LabelEditContext } from "./interactions/labelEditor";
import { getNodeDepth, getNodeById, getChildNodeIds, getEdgeById, type EditorState } from "./state";
import { snap } from "./controls/gridSnap";
import { SelectionOverlay } from "./canvas/selectionOverlay";
import { EdgeHandleOverlay } from "./canvas/edgeHandleOverlay";
import { DomLabelManager } from "./canvas/domLabels";
import { DEFAULT_FONT_FAMILY } from "./canvas/textDefaults";

export interface RendererCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onOpenFileLink: (id: string, kind: "node" | "edge") => void;
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
    onOpenFileLink: (id) => callbacks.onOpenFileLink(id, "node"),
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

  const nodeZIndexMap = new Map<string, number>();

  // Selection glow containers for locked mode
  const GLOW_COLOR = 0x4488ff;
  const SPACE_GLOW_COLOR = 0x44ccff;
  const SECONDARY_GLOW_COLOR = 0x9944ff;
  const SPACE_SECONDARY_GLOW_COLOR = 0xbb66ff;
  const selectionGlows = new Map<string, Graphics>();
  let glowPulse = 0; // 0..1 oscillating value for pulsing glow alpha

  function drawNodeGlow(glow: Graphics, x: number, y: number, width: number, height: number, color: number): void {
    glow.clear();
    glow.roundRect(x - 10, y - 10, width + 20, height + 20, 10)
      .stroke({ width: 6, color, alpha: 0.15 });
    glow.roundRect(x - 6, y - 6, width + 12, height + 12, 7)
      .stroke({ width: 4, color, alpha: 0.3 });
    glow.roundRect(x - 3, y - 3, width + 6, height + 6, 4)
      .stroke({ width: 2, color, alpha: 0.5 });
  }

  function updateSelectionGlows(selectedNodeIds: string[], selectedEdgeIds: string[], locked: boolean, theme?: string): void {
    if (!locked) {
      for (const [, gfx] of selectionGlows) {
        viewport.removeChild(gfx);
        gfx.destroy();
      }
      selectionGlows.clear();
      return;
    }

    const isSpace = theme === "space";
    const primaryColor = isSpace ? SPACE_GLOW_COLOR : GLOW_COLOR;
    const secondaryColor = isSpace ? SPACE_SECONDARY_GLOW_COLOR : SECONDARY_GLOW_COLOR;

    // Compute secondary nodes: endpoints of selected edges not in primary selection
    const primarySet = new Set(selectedNodeIds);
    const secondaryNodeIds = new Set<string>();
    for (const edgeId of selectedEdgeIds) {
      const edge = getEdgeById(edgeId);
      if (!edge) continue;
      if ("nodeId" in edge.from && !primarySet.has(edge.from.nodeId)) {
        secondaryNodeIds.add(edge.from.nodeId);
      }
      if ("nodeId" in edge.to && !primarySet.has(edge.to.nodeId)) {
        secondaryNodeIds.add(edge.to.nodeId);
      }
    }

    // All nodes that need a glow
    const allGlowIds = new Set([...selectedNodeIds, ...secondaryNodeIds]);

    // Remove glows for nodes no longer needing one
    for (const [id, gfx] of selectionGlows) {
      if (!allGlowIds.has(id)) {
        viewport.removeChild(gfx);
        gfx.destroy();
        selectionGlows.delete(id);
      }
    }

    // Add/update glows
    for (const nodeId of allGlowIds) {
      const node = getNodeById(nodeId);
      if (!node) continue;

      let glow = selectionGlows.get(nodeId);
      if (!glow) {
        glow = new Graphics();
        glow.label = `__sel_glow_${nodeId}`;
        glow.eventMode = "none";
        viewport.addChild(glow);
        selectionGlows.set(nodeId, glow);
      }

      const { x, y, width, height } = node.bounds;
      const nodeZ = nodeZIndexMap.get(nodeId) ?? 1000;
      glow.zIndex = nodeZ - 0.1;

      const color = secondaryNodeIds.has(nodeId) ? secondaryColor : primaryColor;
      drawNodeGlow(glow, x, y, width, height, color);
    }
  }

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

  // Sync DOM label positions + pulse glow every frame
  app.ticker.add((ticker) => {
    if (!lastState) return;
    const zoom = viewport.scale.x;
    const vpX = viewport.position.x;
    const vpY = viewport.position.y;
    domLabels.syncPositions(zoom, vpX, vpY);

    // Pulse glow alpha for selected items in locked mode
    if (selectionGlows.size > 0 || (lastState && lastState.selectedEdgeIds.length > 0 && isLocked)) {
      glowPulse = (glowPulse + ticker.deltaMS * 0.001) % 1;
      const pulse = 0.5 + 0.5 * Math.sin(glowPulse * Math.PI * 2); // 0..1
      const alpha = 0.6 + 0.4 * pulse;

      // Pulse node glows
      for (const [, gfx] of selectionGlows) {
        gfx.alpha = alpha;
      }

      // Pulse edge glows
      if (lastState) {
        for (const edgeId of lastState.selectedEdgeIds) {
          const edgeContainer = viewport.getChildByLabel(edgeId) as Container | null;
          if (!edgeContainer) continue;
          const edgeGlow = edgeContainer.getChildByLabel("edge-glow") as Graphics | null;
          if (edgeGlow?.visible) {
            edgeGlow.alpha = alpha;
          }
        }
      }
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
        domLabels.removeLabel(id);
      }
    }

    // Check for in-flight edge handle drag overrides
    const handleOverride = edgeHandleOverlay.getEndpointOverride();
    const wpOverride = edgeHandleOverlay.getWaypointOverrides();

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

      // Skip edges with missing node references
      const from = resolveEndpoint(renderEdge.from, nodeMap);
      const to = resolveEndpoint(renderEdge.to, nodeMap);
      if (!from || !to) continue;

      let edgeContainer = viewport.getChildByLabel(edge.id) as Container | null;
      if (!edgeContainer) {
        edgeContainer = createCanvasEdge(edge, labelColor, {
          onSelect: (edgeId) => callbacks.onEdgeSelect(edgeId),
          onOpenFileLink: (edgeId) => callbacks.onOpenFileLink(edgeId, "edge"),
          isLocked: () => isLocked,
          onDoubleClick: (edgeId, container, worldPos, ctrlKey) => {
            if (isLocked) return;

            // Ctrl+double-click: insert a waypoint at the clicked segment
            if (ctrlKey && worldPos) {
              const currentEdge = getEdgeById(edgeId);
              if (!currentEdge) return;

              const from = resolveEndpoint(currentEdge.from, buildNodeMap(lastState!));
              const to = resolveEndpoint(currentEdge.to, buildNodeMap(lastState!));
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
        }, doc.theme);
        viewport.addChild(edgeContainer);
      }

      edgeContainer.zIndex = (handleOverride && edge.id === handleOverride.edgeId) ? 8999 : computeEdgeZIndex(edge);

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
      updateSelectionGlows(stateSelectedNodeIds, state.selectedEdgeIds, true, doc.theme);
    } else {
      // Edit mode: dashed overlay + resize handles
      updateSelectionGlows([], [], false);
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
