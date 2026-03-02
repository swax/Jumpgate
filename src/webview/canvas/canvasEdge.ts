import { BlurFilter, Container, FederatedPointerEvent, Graphics } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../../schema";
import { colorToHex, DOUBLE_CLICK_MS, DRAG_THRESHOLD } from "../shared";
import type { LabelEditContext } from "../interactions/labelEditor";
import { getEdgeGroupMeta, setEdgeGroupMeta } from "./metadata";

const DEFAULT_EDGE_COLOR = 0x888888;
const SELECTED_EDGE_COLOR = 0x4488ff;
const SPACE_EDGE_COLOR = 0x335577;
const SPACE_SELECTED_COLOR = 0x44CCFF;
const HIT_TOLERANCE = 8;
const ARROWHEAD_SIZE = 10;

type Point = { x: number; y: number };

/** Convert a proportional anchor [0..1, 0..1] to world coordinates. */
export function resolveAnchor(node: Bounds, anchor?: [number, number]): { x: number; y: number } {
  const ax = anchor ? anchor[0] : 0.5;
  const ay = anchor ? anchor[1] : 0.5;
  return {
    x: node.x + node.width * ax,
    y: node.y + node.height * ay,
  };
}

/** Resolve an endpoint to world coordinates. Node-anchored endpoints use the node + anchor; free-point endpoints use x/y directly. */
export function resolveEndpoint(
  endpoint: EdgeEndpoint,
  nodeMap: Map<string, Bounds>
): { x: number; y: number } | null {
  if ("nodeId" in endpoint) {
    const node = nodeMap.get(endpoint.nodeId);
    if (!node) return null;
    return resolveAnchor(node, endpoint.anchor);
  }
  return { x: endpoint.x, y: endpoint.y };
}

/** Build the full polyline: [from, ...waypoints, to]. */
export function buildPolylinePoints(
  from: Point,
  to: Point,
  waypoints?: Point[]
): Point[] {
  if (!waypoints || waypoints.length === 0) return [from, to];
  return [from, ...waypoints, to];
}

/** Walk 50% of total arc length to find the midpoint for label placement. */
export function computePolylineMidpoint(points: Point[]): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

  // Compute total length
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  const halfLen = totalLen / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (walked + segLen >= halfLen) {
      const remaining = halfLen - walked;
      const t = segLen > 0 ? remaining / segLen : 0;
      return {
        x: points[i - 1].x + dx * t,
        y: points[i - 1].y + dy * t,
      };
    }
    walked += segLen;
  }

  // Fallback: last point
  return points[points.length - 1];
}

/** Point-to-segment distance (exported for hit-testing in renderer). */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = px - x1;
    const ey = py - y1;
    return Math.sqrt(ex * ex + ey * ey);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  return Math.sqrt(ex * ex + ey * ey);
}

export interface CanvasEdgeCallbacks {
  onSelect: (edgeId: string) => void;
  onDoubleClick: (edgeId: string, container: Container, worldPos?: Point, ctrlKey?: boolean) => void;
  onOpenFileLink: (edgeId: string, preview?: boolean) => void;
  isLocked: () => boolean;
  isEdgeMode: () => boolean;
  getSelectedEdgeIds: () => string[];
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

    const onUp = () => {
      gfx.off("pointerup", onUp);
      gfx.off("pointerupoutside", onUp);

      const now = Date.now();
      if (now - lastClickTime < DOUBLE_CLICK_MS) {
        lastClickTime = 0;
        callbacks.onDoubleClick(edge.id, group, lastPointerWorldPos, lastCtrlKey);
      } else {
        lastClickTime = now;

        // Ctrl+Click on linked edge — open file
        if ((lastCtrlKey) && getEdgeGroupMeta(group)?.hasFileLink) {
          callbacks.onOpenFileLink(edge.id);
        } else {
          callbacks.onSelect(edge.id);
        }
      }
    };

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

/** Custom hit area checking point-to-segment distance across all polyline segments,
 *  plus an optional label bounding rect. */
export class PolylineHitArea {
  labelRect: { x: number; y: number; width: number; height: number } | null = null;

  constructor(private points: Point[], private tolerance: number) {}

  contains(x: number, y: number): boolean {
    if (this.labelRect) {
      const r = this.labelRect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        return true;
      }
    }
    for (let i = 1; i < this.points.length; i++) {
      const dist = pointToSegmentDistance(
        x, y,
        this.points[i - 1].x, this.points[i - 1].y,
        this.points[i].x, this.points[i].y
      );
      if (dist <= this.tolerance) return true;
    }
    return false;
  }
}
