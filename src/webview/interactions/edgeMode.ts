import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import type { Edge, EdgeEndpoint } from "../../schema";
import { getState, setEdgeMode, subscribe } from "../state";
import { snap } from "../controls/gridSnap";
import { resolveAnchor } from "../canvas/canvasEdge";
import { DOT_RADIUS, DOT_COLOR_EMPTY, DOT_COLOR_NODE, findNodeAtPoint, computeAnchor, buildEndpoint } from "../canvas/edgeUtils";

const EDGE_BTN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="5" y1="18" x2="19" y2="6"/>
  <polyline points="13,6 19,6 19,12"/>
</svg>`;

export interface EdgeModeCallbacks {
  addEdge: (edge: Edge) => void;
  generateEdgeId: () => string;
}

export function setupEdgeMode(
  btn: HTMLButtonElement,
  viewport: Container,
  stage: Container,
  callbacks: EdgeModeCallbacks
): void {
  let sourceEndpoint: EdgeEndpoint | null = null;
  let previewLine: Graphics | null = null;
  let cursorDot: Graphics | null = null;
  /** Resolved world position of the source endpoint (for drawing preview line). */
  let sourcePoint: { x: number; y: number } | null = null;

  const statusBar = document.getElementById("edge-mode-status") as HTMLDivElement;

  function updateVisual(): void {
    const { edgeMode, locked } = getState();
    btn.innerHTML = EDGE_BTN_SVG;
    btn.style.display = locked ? "none" : "";
    btn.style.opacity = edgeMode ? "1" : "0.4";
    btn.title = edgeMode ? "Add Edge (active)" : "Add Edge";

    if (edgeMode && !locked) {
      ensureCursorDot();
      updateStatusBar();
    } else {
      cleanupAll();
    }
  }

  function updateStatusBar(): void {
    if (!getState().edgeMode) {
      statusBar.style.display = "none";
      return;
    }
    statusBar.style.display = "block";
    statusBar.textContent = sourceEndpoint
      ? "Click to end the edge. ESC to exit."
      : "Click to start an edge. ESC to exit.";
  }

  function ensureCursorDot(): void {
    if (cursorDot) return;
    cursorDot = new Graphics();
    cursorDot.label = "__edge-cursor-dot";
    cursorDot.eventMode = "none";
    cursorDot.zIndex = 9999;
    viewport.addChild(cursorDot);
  }

  function drawDot(worldX: number, worldY: number, color: number): void {
    if (!cursorDot) return;
    cursorDot.clear();
    cursorDot.circle(0, 0, DOT_RADIUS / viewport.scale.x);
    cursorDot.fill(color);
    cursorDot.position.set(worldX, worldY);
  }

  btn.addEventListener("click", () => {
    const { edgeMode } = getState();
    if (edgeMode) {
      cleanupAll();
      setEdgeMode(false);
    } else {
      setEdgeMode(true);
    }
  });

  function cleanupAll(): void {
    sourceEndpoint = null;
    sourcePoint = null;
    if (previewLine) {
      previewLine.destroy();
      previewLine = null;
    }
    if (cursorDot) {
      cursorDot.destroy();
      cursorDot = null;
    }
    statusBar.style.display = "none";
  }

  function cancelEdgeCreation(): void {
    sourceEndpoint = null;
    sourcePoint = null;
    if (previewLine) {
      previewLine.destroy();
      previewLine = null;
    }
    updateStatusBar();
  }

  // Handle all clicks for edge creation via the stage (catches both node and empty-space clicks).
  // Node handlers return early without stopPropagation in edge mode, so events bubble here.
  stage.on("pointerdown", (e: FederatedPointerEvent) => {
    if (!getState().edgeMode) return;

    e.stopPropagation();

    const worldPos = viewport.toLocal(e.global);
    const { endpoint, resolved } = buildEndpoint(worldPos.x, worldPos.y, viewport);

    if (!sourceEndpoint) {
      // First click: set source
      sourceEndpoint = endpoint;
      sourcePoint = resolved;

      previewLine = new Graphics();
      previewLine.label = "__edge-preview";
      previewLine.eventMode = "none";
      viewport.addChild(previewLine);
      updateStatusBar();
    } else {
      // Second click: create edge
      // Prevent self-loops on the same node
      if (
        "nodeId" in sourceEndpoint &&
        "nodeId" in endpoint &&
        sourceEndpoint.nodeId === endpoint.nodeId
      ) {
        return;
      }

      const edge: Edge = {
        id: callbacks.generateEdgeId(),
        from: sourceEndpoint,
        to: endpoint,
      };
      callbacks.addEdge(edge);

      // Clean up preview but stay in edge mode
      cancelEdgeCreation();
    }
  });

  // Cursor dot + preview line follow cursor
  stage.on("globalpointermove", (e: FederatedPointerEvent) => {
    if (!getState().edgeMode) return;

    const worldPos = viewport.toLocal(e.global);
    const sx = getState().snapToGrid ? snap(worldPos.x) : worldPos.x;
    const sy = getState().snapToGrid ? snap(worldPos.y) : worldPos.y;
    const hitNode = findNodeAtPoint(sx, sy, viewport);

    // Update cursor dot
    ensureCursorDot();
    if (hitNode) {
      const anchor = computeAnchor(sx, sy, hitNode);
      const snappedPos = resolveAnchor(hitNode, anchor);
      drawDot(snappedPos.x, snappedPos.y, DOT_COLOR_NODE);
    } else {
      drawDot(sx, sy, DOT_COLOR_EMPTY);
    }

    // Update preview line
    if (sourceEndpoint && previewLine && sourcePoint) {
      const cursorTarget = hitNode
        ? resolveAnchor(hitNode, computeAnchor(sx, sy, hitNode))
        : { x: sx, y: sy };

      previewLine.clear();
      previewLine
        .moveTo(sourcePoint.x, sourcePoint.y)
        .lineTo(cursorTarget.x, cursorTarget.y)
        .stroke({ width: 2, color: 0x4488ff });
    }
  });

  // ESC always exits edge mode entirely
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && getState().edgeMode) {
      cleanupAll();
      setEdgeMode(false);
    }
  });

  updateVisual();
  subscribe(updateVisual);
}
