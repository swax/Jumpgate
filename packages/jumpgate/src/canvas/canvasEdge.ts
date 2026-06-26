import { BlurFilter, Container, FederatedPointerEvent, Graphics } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../schema";
import { colorToHex, DOUBLE_CLICK_MS, DRAG_THRESHOLD } from "../shared";
import { getEdgeGroupMeta, setEdgeGroupMeta } from "./metadata";
import { buildEndpoint } from "./edgeUtils";
import { getState, getEdgeById } from "../state";
import { snap } from "../controls/gridSnap";
import { resolveEndpoint, buildPolylinePoints, PolylineHitArea, type Point } from "./edgeGeometry";

export {
  resolveAnchor,
  resolveEndpoint,
  buildPolylinePoints,
  computePolylineMidpoint,
  pointToSegmentDistance,
  PolylineHitArea,
  type Point,
} from "./edgeGeometry";

const DEFAULT_EDGE_COLOR = 0x888888;
const SELECTED_EDGE_COLOR = 0x4488ff;
const SPACE_EDGE_COLOR = 0x335577;
const SPACE_SELECTED_COLOR = 0x44ccff;
const HIT_TOLERANCE = 8;
const ARROWHEAD_SIZE = 10;

export interface CanvasEdgeCallbacks {
  onSelect: (edgeId: string) => void;
  onDoubleClick: (
    edgeId: string,
    container: Container,
    worldPos?: Point,
    ctrlKey?: boolean,
  ) => void;
  onOpenFileLink: (edgeId: string, preview?: boolean) => void;
  isLocked: () => boolean;
  isEdgeMode: () => boolean;
  getSelectedEdgeIds: () => string[];
  onDragUpdate: () => void;
  onEdgeChanged: (
    edgeId: string,
    changes: Partial<Pick<Edge, "from" | "to" | "waypoints">>,
  ) => void;
  getViewport: () => Container;
}

export function createCanvasEdge(
  edge: Edge,
  labelColor: string,
  callbacks: CanvasEdgeCallbacks,
  _theme?: string,
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
        const segmentIndex =
          hitArea instanceof PolylineHitArea
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
          origWaypoints: currentEdge.waypoints
            ? currentEdge.waypoints.map((wp) => ({ ...wp }))
            : [],
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
          getState().snapToGrid,
        );
        segmentDrag.inFlightFrom = endpoint;
      }

      if (segmentDrag.moveTo) {
        const { endpoint } = buildEndpoint(
          segmentDrag.origToResolved.x + deltaX,
          segmentDrag.origToResolved.y + deltaY,
          viewport,
          getState().snapToGrid,
        );
        segmentDrag.inFlightTo = endpoint;
      }

      if (segmentDrag.origWaypoints.length > 0) {
        const newWaypoints = segmentDrag.origWaypoints.map((wp) => ({ ...wp }));
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
        if (segmentDrag.inFlightWaypoints !== undefined)
          changes.waypoints = segmentDrag.inFlightWaypoints;
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
  locked = false,
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
  const baseWidth = isSpace ? 1.5 : 2;
  const lineWidth = edge.width ?? baseWidth;
  const alpha = edge.opacity ?? 1;
  // A translucent solid edge is drawn as one FILLED ribbon instead of a stroke: a single fill is
  // one coverage pass, so the edge never darkens where it overlaps itself at a bend, and it draws
  // straight to the antialiased canvas (no filter, so no jaggies). Different edges still blend.
  // Opaque or dashed edges keep the normal stroke path.
  const style = edge.style ?? "solid";
  const useRibbon = style === "solid" && alpha < 1;
  const arrow = edge.arrow ?? "end";
  const smooth = (edge.curve ?? "straight") === "smooth";

  // Selection glow — separate Graphics so its alpha can be pulsed independently
  edgeGlow.clear();
  if (isSelected && locked) {
    const glowColor = isSpace ? SPACE_SELECTED_COLOR : SELECTED_EDGE_COLOR;
    tracePath(edgeGlow, points, smooth);
    edgeGlow.stroke({ width: 10, color: glowColor, alpha: 1.0 });
    tracePath(edgeGlow, points, smooth);
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
    tracePath(gfx, points, smooth);
    gfx.stroke({ width: 4, color, alpha: 0.12 });
  }

  // Draw main line through all points
  if (useRibbon) {
    gfx.poly(ribbonPolygon(samplePath(points, smooth), lineWidth, smooth)).fill({ color, alpha });
  } else if (style === "solid") {
    tracePath(gfx, points, smooth);
    gfx.stroke({ width: lineWidth, color, alpha });
  } else {
    for (let i = 1; i < points.length; i++) {
      drawDashedLine(
        gfx,
        points[i - 1].x,
        points[i - 1].y,
        points[i].x,
        points[i].y,
        lineWidth,
        color,
        style,
        alpha,
      );
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
      drawDashedLine(
        gfx,
        points[i - 1].x,
        points[i - 1].y,
        points[i].x,
        points[i].y,
        3,
        isSpace ? SPACE_SELECTED_COLOR : SELECTED_EDGE_COLOR,
        "dashed",
      );
    }
  }

  // Hit area for click detection. The band is at least HIT_TOLERANCE screen pixels wide so thin
  // edges stay easy to grab, but never narrower than the edge's own half-width so a wide ribbon is
  // clickable across its whole body. The containment path follows the flattened curve (so a curved
  // edge's hit region hugs the visible bend), while the coarse points drive drag-segment mapping.
  const baseTolerance = Math.max(HIT_TOLERANCE / viewportScale, HIT_TOLERANCE);
  const tolerance = Math.max(baseTolerance, lineWidth / 2);
  gfx.hitArea = new PolylineHitArea(samplePath(points, smooth), tolerance, points);
}

function drawPolyline(gfx: Graphics, points: Point[]): void {
  gfx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    gfx.lineTo(points[i].x, points[i].y);
  }
}

/**
 * Trace a path through `points`. When `smooth`, each segment is a cubic bezier with
 * horizontal control handles (the Sankey/flow look) — so a path needs only its endpoints
 * plus a waypoint or two to read as a smooth curve, keeping draggable handles to a minimum.
 * Otherwise it's a straight polyline.
 */
function tracePath(gfx: Graphics, points: Point[], smooth: boolean): void {
  gfx.moveTo(points[0].x, points[0].y);
  if (!smooth || points.length < 2) {
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    return;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = (b.x - a.x) * 0.5;
    gfx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
  }
}

/** Flatten the path into a dense polyline. `smooth` samples the same horizontal-tangent
 *  beziers `tracePath` draws, so the filled ribbon hugs exactly the curve a stroke would. */
function samplePath(points: Point[], smooth: boolean): Point[] {
  if (!smooth || points.length < 2) return points;
  const out: Point[] = [points[0]];
  const N = 16;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = (b.x - a.x) * 0.5;
    const c1x = a.x + dx, c2x = b.x - dx;
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y,
      });
    }
  }
  return out;
}

/** Build a closed ribbon polygon of constant width centred on `centerline` — offset each
 *  point by ±width/2 along the local normal, then return the top edge followed by the bottom
 *  edge reversed. Filled once, a ribbon has uniform coverage (no self-overlap darkening).
 *  When `flatEnds`, the first/last caps use a vertical normal: smooth edges leave a node with a
 *  horizontal tangent, so a vertical cap meets the (vertical) node side flush instead of tilting
 *  by the slope of the first sampled chord. */
function ribbonPolygon(centerline: Point[], width: number, flatEnds = false): Point[] {
  const half = width / 2;
  const last = centerline.length - 1;
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let i = 0; i < centerline.length; i++) {
    let nx: number;
    let ny: number;
    if (flatEnds && (i === 0 || i === last)) {
      nx = 0;
      ny = half;
    } else {
      const prev = centerline[Math.max(0, i - 1)];
      const next = centerline[Math.min(last, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      nx = -ty * half;
      ny = tx * half;
    }
    const p = centerline[i];
    top.push({ x: p.x + nx, y: p.y + ny });
    bottom.push({ x: p.x - nx, y: p.y - ny });
  }
  bottom.reverse();
  return top.concat(bottom);
}

function drawDashedLine(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: number,
  style: "dashed" | "dotted",
  alpha = 1,
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
      .stroke({ width, color, alpha });
    pos += segLen;
  }
}

function drawArrowhead(gfx: Graphics, from: Point, to: Point, color: number): void {
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

  gfx
    .poly([
      tipX,
      tipY,
      baseX + px * halfWidth,
      baseY + py * halfWidth,
      baseX - px * halfWidth,
      baseY - py * halfWidth,
    ])
    .fill(color);
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

export function getSegmentDragOverride(): {
  edgeId: string;
  from?: EdgeEndpoint;
  to?: EdgeEndpoint;
  waypoints?: Point[];
} | null {
  if (!segmentDrag) return null;
  return {
    edgeId: segmentDrag.edgeId,
    ...(segmentDrag.inFlightFrom && { from: segmentDrag.inFlightFrom }),
    ...(segmentDrag.inFlightTo && { to: segmentDrag.inFlightTo }),
    ...(segmentDrag.inFlightWaypoints !== undefined && {
      waypoints: segmentDrag.inFlightWaypoints,
    }),
  };
}

export function isEdgeDragging(): boolean {
  return segmentDrag !== null;
}
