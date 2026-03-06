import { BlurFilter, Container, FederatedPointerEvent, Graphics } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../schema";
import { colorToHex, DOUBLE_CLICK_MS, DRAG_THRESHOLD } from "../shared";
import type { LabelEditContext } from "./labelEditor";
import { getEdgeGroupMeta, setEdgeGroupMeta } from "./metadata";
import { buildEndpoint } from "./edgeUtils";
import { getState, getEdgeById } from "../state";
import { snap } from "../controls/gridSnap";
import { resolveAnchor, resolveEndpoint, buildPolylinePoints, computePolylineMidpoint, pointToSegmentDistance, PolylineHitArea, type Point } from "./edgeGeometry";

export { resolveAnchor, resolveEndpoint, buildPolylinePoints, computePolylineMidpoint, pointToSegmentDistance, PolylineHitArea, type Point } from "./edgeGeometry";

const DEFAULT_EDGE_COLOR = 0x888888;
const SELECTED_EDGE_COLOR = 0x4488ff;
const SPACE_EDGE_COLOR = 0x335577;
const SPACE_SELECTED_COLOR = 0x44CCFF;
const HIT_TOLERANCE = 8;
const ARROWHEAD_SIZE = 10;

export interface CanvasEdgeCallbacks {
  onSelect: (edgeId: string) => void;
  onDoubleClick: (edgeId: string, container: Container, worldPos?: Point, ctrlKey?: boolean) => void;
  onOpenFileLink: (edgeId: string, preview?: boolean) => void;
  isLocked: () => boolean;
  isEdgeMode: () => boolean;
  getSelectedEdgeIds: () => string[];
  onDragUpdate: () => void;
  onEdgeChanged: (edgeId: string, changes: Partial<Pick<Edge, "from" | "to" | "waypoints">>) => void;
  getViewport: () => Container;
}

export function createCanvasEdge(
  edge: Edge,
  labelColor: string,
  callbacks: CanvasEdgeCallbacks,
  theme?: string
): Container {
  const group = new Container();
  group.label = edge.id;
  group.eventMode = "auto";
  group.cursor = edge.fileLink ? "pointer" : "default";

  const edgeGlow = new Graphics();
  edgeGlow.label = "edge-glow";
  edgeGlow.eventMode = "none";
  edgeGlow.visible = false;
  group.addChild(edgeGlow);

  const gfx = new Graphics();
  gfx.label = "edge-line";
  gfx.eventMode = "static";
  gfx.cursor = edge.fileLink ? "pointer" : "default";

  group.addChild(gfx);

  setEdgeGroupMeta(group, {
    hasFileLink: !!edge.fileLink,
    fileLinkPath: edge.fileLink?.path ?? null,
  });

  // Tooltip on linked edge hover
  gfx.on("pointerover", () => {
    const m = getEdgeGroupMeta(group);
    if (m?.fileLinkPath) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = `${m.fileLinkPath} (Double-click)`;
    }
  });
  gfx.on("pointerout", () => {
    const m = getEdgeGroupMeta(group);
    if (m?.fileLinkPath) {
      const canvas = document.querySelector("canvas");
      if (canvas) canvas.title = "";
    }
  });

  let lastClickTime = 0;
  let lastPointerWorldPos: Point | undefined;
  let lastCtrlKey = false;

  gfx.on("pointerdown", (e) => {
    // Middle-click on linked edge — open file in new pinned tab
    if (e.button === 1 && getEdgeGroupMeta(group)?.hasFileLink) {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onOpenFileLink(edge.id, false);
      return;
    }

    // Right-click is handled by the context menu; ignore here so it doesn't
    // feed into the double-click timer.
    if (e.button === 2) return;

    // In locked mode, don't stop propagation so drag-to-pan works through edges.
    // Only register a click if pointer didn't move.
    if (callbacks.isLocked()) {
      const downPos = { x: e.global.x, y: e.global.y };
      const onUpLocked = (ue: FederatedPointerEvent) => {
        gfx.off("pointerup", onUpLocked);
        gfx.off("pointerupoutside", onUpLocked);
        const dx = ue.global.x - downPos.x;
        const dy = ue.global.y - downPos.y;
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
          const now = Date.now();
          if (now - lastClickTime < DOUBLE_CLICK_MS && getEdgeGroupMeta(group)?.hasFileLink) {
            lastClickTime = 0;
            callbacks.onOpenFileLink(edge.id);
          } else {
            lastClickTime = now;
            callbacks.onSelect(edge.id);
          }
        }
      };
      gfx.on("pointerup", onUpLocked);
      gfx.on("pointerupoutside", onUpLocked);
      return;
    }

    if (callbacks.isEdgeMode()) return; // Let event propagate for edge creation

    // Unselected edge: don't stop propagation (allows pan on drag).
    // Only register click/double-click if pointer didn't move.
    if (!callbacks.getSelectedEdgeIds().includes(edge.id)) {
      const downPos = { x: e.global.x, y: e.global.y };
      const onUpUnselected = (ue: FederatedPointerEvent) => {
        gfx.off("pointerup", onUpUnselected);
        gfx.off("pointerupoutside", onUpUnselected);
        const dx = ue.global.x - downPos.x;
        const dy = ue.global.y - downPos.y;
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
          lastPointerWorldPos = gfx.toLocal(ue.global);
          lastCtrlKey = ue.ctrlKey || ue.metaKey;
          const now = Date.now();
          if (now - lastClickTime < DOUBLE_CLICK_MS) {
            lastClickTime = 0;
            callbacks.onDoubleClick(edge.id, group, lastPointerWorldPos, lastCtrlKey);
          } else {
            lastClickTime = now;
            if (lastCtrlKey && getEdgeGroupMeta(group)?.hasFileLink) {
              callbacks.onOpenFileLink(edge.id);
            } else {
              callbacks.onSelect(edge.id);
            }
          }
        }
      };
      gfx.on("pointerup", onUpUnselected);
      gfx.on("pointerupoutside", onUpUnselected);
      return;
    }

    e.stopPropagation();

    // Capture world position and modifier keys for double-click
    lastPointerWorldPos = gfx.toLocal(e.global);
    lastCtrlKey = e.ctrlKey || e.metaKey;

    const pointerDownGlobal = { x: e.global.x, y: e.global.y };
    const viewport = callbacks.getViewport();
    const startWorld = viewport.toLocal(e.global);
    let dragging = false;

    const onMove = (me: FederatedPointerEvent) => {
      const dx = me.global.x - pointerDownGlobal.x;
      const dy = me.global.y - pointerDownGlobal.y;

      if (!dragging) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
        dragging = true;

        // Initialize segment drag state
        const currentEdge = getEdgeById(edge.id);
        if (!currentEdge) return;

        const state = getState();
        const nodeMap = new Map<string, Bounds>();
        for (const n of state.document.nodes) {
          nodeMap.set(n.id, n.bounds);
        }

        const origFromResolved = resolveEndpoint(currentEdge.from, nodeMap);
        const origToResolved = resolveEndpoint(currentEdge.to, nodeMap);
        if (!origFromResolved || !origToResolved) return;

        const hitArea = gfx.hitArea;
        const segmentIndex = (hitArea instanceof PolylineHitArea)
          ? hitArea.findSegmentIndex(startWorld.x, startWorld.y)
          : 0;

        const numWaypoints = currentEdge.waypoints?.length ?? 0;
        let moveFrom: boolean;
        let moveTo: boolean;
        const waypointIndices: number[] = [];

        if (numWaypoints === 0) {
          moveFrom = true;
          moveTo = true;
        } else {
          moveFrom = segmentIndex === 0;
          moveTo = segmentIndex === numWaypoints;
          if (!moveFrom) waypointIndices.push(segmentIndex - 1);
          if (!moveTo) waypointIndices.push(segmentIndex);
        }

        segmentDrag = {
          edgeId: edge.id,
          segmentIndex,
          startWorld,
          moveFrom,
          moveTo,
          waypointIndices,
          origFromResolved,
          origToResolved,
          origWaypoints: currentEdge.waypoints ? currentEdge.waypoints.map(wp => ({ ...wp })) : [],
        };
      }

      if (!segmentDrag) return;

      const currentWorld = viewport.toLocal(me.global);
      const deltaX = currentWorld.x - startWorld.x;
      const deltaY = currentWorld.y - startWorld.y;

      if (segmentDrag.moveFrom) {
        const { endpoint } = buildEndpoint(
          segmentDrag.origFromResolved.x + deltaX,
          segmentDrag.origFromResolved.y + deltaY,
          viewport,
          getState().snapToGrid
        );
        segmentDrag.inFlightFrom = endpoint;
      }

      if (segmentDrag.moveTo) {
        const { endpoint } = buildEndpoint(
          segmentDrag.origToResolved.x + deltaX,
          segmentDrag.origToResolved.y + deltaY,
          viewport,
          getState().snapToGrid
        );
        segmentDrag.inFlightTo = endpoint;
      }

      if (segmentDrag.origWaypoints.length > 0) {
        const newWaypoints = segmentDrag.origWaypoints.map(wp => ({ ...wp }));
        const snapEnabled = getState().snapToGrid;
        for (const wpIdx of segmentDrag.waypointIndices) {
          const newX = segmentDrag.origWaypoints[wpIdx].x + deltaX;
          const newY = segmentDrag.origWaypoints[wpIdx].y + deltaY;
          newWaypoints[wpIdx] = {
            x: snapEnabled ? snap(newX) : newX,
            y: snapEnabled ? snap(newY) : newY,
          };
        }
        segmentDrag.inFlightWaypoints = newWaypoints;
      }

      callbacks.onDragUpdate();
    };

    const onUp = () => {
      gfx.off("globalpointermove", onMove);
      gfx.off("pointerup", onUp);
      gfx.off("pointerupoutside", onUp);

      if (dragging && segmentDrag) {
        // Commit changes
        const changes: Partial<Pick<Edge, "from" | "to" | "waypoints">> = {};
        if (segmentDrag.inFlightFrom) changes.from = segmentDrag.inFlightFrom;
        if (segmentDrag.inFlightTo) changes.to = segmentDrag.inFlightTo;
        if (segmentDrag.inFlightWaypoints !== undefined) changes.waypoints = segmentDrag.inFlightWaypoints;
        segmentDrag = null;
        callbacks.onEdgeChanged(edge.id, changes);
      } else {
        // Existing click/double-click handling
        const now = Date.now();
        if (now - lastClickTime < DOUBLE_CLICK_MS) {
          lastClickTime = 0;
          callbacks.onDoubleClick(edge.id, group, lastPointerWorldPos, lastCtrlKey);
        } else {
          lastClickTime = now;
          if (lastCtrlKey && getEdgeGroupMeta(group)?.hasFileLink) {
            callbacks.onOpenFileLink(edge.id);
          } else {
            callbacks.onSelect(edge.id);
          }
        }
      }
    };

    gfx.on("globalpointermove", onMove);
    gfx.on("pointerup", onUp);
    gfx.on("pointerupoutside", onUp);
  });

  return group;
}

export function updateCanvasEdge(
  group: Container,
  edge: Edge,
  nodeMap: Map<string, Bounds>,
  isSelected: boolean,
  viewportScale: number,
  labelColor: string,
  theme?: string,
  locked = false
): void {
  const edgeGlow = group.getChildByLabel("edge-glow") as Graphics;
  const gfx = group.getChildByLabel("edge-line") as Graphics;

  gfx.clear();
  gfx.cursor = edge.fileLink ? "pointer" : "default";
  group.cursor = edge.fileLink ? "pointer" : "default";
  setEdgeGroupMeta(group, {
    hasFileLink: !!edge.fileLink,
    fileLinkPath: edge.fileLink?.path ?? null,
  });

  const from = resolveEndpoint(edge.from, nodeMap);
  const to = resolveEndpoint(edge.to, nodeMap);
  if (!from || !to) return;

  const points = buildPolylinePoints(from, to, edge.waypoints);

  const isSpace = theme === "space";
  const color = colorToHex(edge.color, isSpace ? SPACE_EDGE_COLOR : DEFAULT_EDGE_COLOR);
  const lineWidth = isSpace ? 1.5 : 2;
  const style = edge.style ?? "solid";
  const arrow = edge.arrow ?? "end";

  // Selection glow — separate Graphics so its alpha can be pulsed independently
  edgeGlow.clear();
  if (isSelected && locked) {
    const glowColor = isSpace ? SPACE_SELECTED_COLOR : SELECTED_EDGE_COLOR;
    drawPolyline(edgeGlow, points);
    edgeGlow.stroke({ width: 10, color: glowColor, alpha: 1.0 });
    drawPolyline(edgeGlow, points);
    edgeGlow.stroke({ width: 4, color: 0xffffff, alpha: 0.7 });
    if (!edgeGlow.filters || !(edgeGlow.filters as BlurFilter[])[0]) {
      edgeGlow.filters = [new BlurFilter({ strength: 5, quality: 4 })];
    }
    edgeGlow.visible = true;
  } else {
    edgeGlow.visible = false;
  }

  // Glow pass — wider low-alpha stroke behind the main line (space theme only)
  if (isSpace && style === "solid") {
    drawPolyline(gfx, points);
    gfx.stroke({ width: 4, color, alpha: 0.12 });
  }

  // Draw main line through all points
  if (style === "solid") {
    drawPolyline(gfx, points);
    gfx.stroke({ width: lineWidth, color });
  } else {
    for (let i = 1; i < points.length; i++) {
      drawDashedLine(gfx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, lineWidth, color, style);
    }
  }

  // Draw arrowheads using first/last segment directions
  if (arrow === "end" || arrow === "both") {
    const n = points.length;
    drawArrowhead(gfx, points[n - 2], points[n - 1], color);
  }
  if (arrow === "start" || arrow === "both") {
    drawArrowhead(gfx, points[1], points[0], color);
  }

  // Draw selection overlay along all segments (unlocked mode only)
  if (isSelected && !locked) {
    for (let i = 1; i < points.length; i++) {
      drawDashedLine(gfx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 3, isSpace ? SPACE_SELECTED_COLOR : SELECTED_EDGE_COLOR, "dashed");
    }
  }

  // Hit area for click detection (wider than the visual line)
  const tolerance = HIT_TOLERANCE / viewportScale;
  gfx.hitArea = new PolylineHitArea(points, Math.max(tolerance, HIT_TOLERANCE));

}

function drawPolyline(gfx: Graphics, points: Point[]): void {
  gfx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x, points[i].y);
  }
}

function drawDashedLine(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: number,
  style: "dashed" | "dotted"
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  const dashLen = style === "dashed" ? 10 : 3;
  const gapLen = style === "dashed" ? 6 : 5;
  const segLen = dashLen + gapLen;
  const ux = dx / dist;
  const uy = dy / dist;

  let pos = 0;
  while (pos < dist) {
    const endPos = Math.min(pos + dashLen, dist);
    gfx
      .moveTo(x1 + ux * pos, y1 + uy * pos)
      .lineTo(x1 + ux * endPos, y1 + uy * endPos)
      .stroke({ width, color });
    pos += segLen;
  }
}

function drawArrowhead(
  gfx: Graphics,
  from: Point,
  to: Point,
  color: number
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  const ux = dx / dist;
  const uy = dy / dist;

  // Perpendicular
  const px = -uy;
  const py = ux;

  const tipX = to.x;
  const tipY = to.y;
  const baseX = tipX - ux * ARROWHEAD_SIZE;
  const baseY = tipY - uy * ARROWHEAD_SIZE;

  const halfWidth = ARROWHEAD_SIZE * 0.5;

  gfx.poly([
    tipX, tipY,
    baseX + px * halfWidth, baseY + py * halfWidth,
    baseX - px * halfWidth, baseY - py * halfWidth,
  ]).fill(color);
}

// ── Segment drag state ─────────────────────────────────────────────

type SegmentDragState = {
  edgeId: string;
  segmentIndex: number;
  startWorld: Point;
  moveFrom: boolean;
  moveTo: boolean;
  waypointIndices: number[];
  origFromResolved: Point;
  origToResolved: Point;
  origWaypoints: Point[];
  inFlightFrom?: EdgeEndpoint;
  inFlightTo?: EdgeEndpoint;
  inFlightWaypoints?: Point[];
};

let segmentDrag: SegmentDragState | null = null;

export function getSegmentDragOverride(): { edgeId: string; from?: EdgeEndpoint; to?: EdgeEndpoint; waypoints?: Point[] } | null {
  if (!segmentDrag) return null;
  return {
    edgeId: segmentDrag.edgeId,
    ...(segmentDrag.inFlightFrom && { from: segmentDrag.inFlightFrom }),
    ...(segmentDrag.inFlightTo && { to: segmentDrag.inFlightTo }),
    ...(segmentDrag.inFlightWaypoints !== undefined && { waypoints: segmentDrag.inFlightWaypoints }),
  };
}

export function isEdgeDragging(): boolean {
  return segmentDrag !== null;
}
