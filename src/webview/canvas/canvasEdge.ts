import { Graphics, Polygon } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../../schema";

const DEFAULT_EDGE_COLOR = 0x888888;
const SELECTED_EDGE_COLOR = 0x4488ff;
const HIT_TOLERANCE = 8;
const ARROWHEAD_SIZE = 10;

function colorToHex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  return parseInt(color.replace("#", ""), 16);
}

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

export interface CanvasEdgeCallbacks {
  onSelect: (edgeId: string) => void;
}

export function createCanvasEdge(edge: Edge, callbacks: CanvasEdgeCallbacks): Graphics {
  const gfx = new Graphics();
  gfx.label = edge.id;
  gfx.eventMode = "static";
  gfx.cursor = edge.fileLink ? "pointer" : "default";

  gfx.on("pointerdown", (e) => {
    e.stopPropagation();
    callbacks.onSelect(edge.id);
  });

  return gfx;
}

export function updateCanvasEdge(
  gfx: Graphics,
  edge: Edge,
  nodeMap: Map<string, Bounds>,
  isSelected: boolean,
  viewportScale: number
): void {
  gfx.clear();
  gfx.cursor = edge.fileLink ? "pointer" : "default";

  const from = resolveEndpoint(edge.from, nodeMap);
  const to = resolveEndpoint(edge.to, nodeMap);
  if (!from || !to) return;

  const color = isSelected ? SELECTED_EDGE_COLOR : colorToHex(edge.color, DEFAULT_EDGE_COLOR);
  const lineWidth = isSelected ? 3 : 2;
  const style = edge.style ?? "solid";
  const arrow = edge.arrow ?? "end";

  // Draw line
  if (style === "solid") {
    gfx.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: lineWidth, color });
  } else {
    drawDashedLine(gfx, from.x, from.y, to.x, to.y, lineWidth, color, style);
  }

  // Draw arrowheads
  if (arrow === "end" || arrow === "both") {
    drawArrowhead(gfx, from, to, color);
  }
  if (arrow === "start" || arrow === "both") {
    drawArrowhead(gfx, to, from, color);
  }

  // Hit area for click detection (wider than the visual line)
  const tolerance = HIT_TOLERANCE / viewportScale;
  gfx.hitArea = new LineHitArea(from.x, from.y, to.x, to.y, Math.max(tolerance, HIT_TOLERANCE));
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
  from: { x: number; y: number },
  to: { x: number; y: number },
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

/** Custom hit area using point-to-segment distance. */
class LineHitArea {
  constructor(
    private x1: number,
    private y1: number,
    private x2: number,
    private y2: number,
    private tolerance: number
  ) {}

  contains(x: number, y: number): boolean {
    return pointToSegmentDistance(x, y, this.x1, this.y1, this.x2, this.y2) <= this.tolerance;
  }
}

// Make LineHitArea compatible with PixiJS IHitArea
(LineHitArea.prototype as any).constructor = LineHitArea;

function pointToSegmentDistance(
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
