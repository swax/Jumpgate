import { Container, Graphics, Polygon, Text as PixiText, TextStyle } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../../schema";
import type { LabelEditContext } from "../interactions/labelEditor";

const DEFAULT_EDGE_COLOR = 0x888888;
const SELECTED_EDGE_COLOR = 0x4488ff;
const HIT_TOLERANCE = 8;
const ARROWHEAD_SIZE = 10;
const DOUBLE_CLICK_MS = 400;

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
  onDoubleClick: (edgeId: string, container: Container) => void;
}

export function createCanvasEdge(
  edge: Edge,
  labelColor: string,
  callbacks: CanvasEdgeCallbacks
): Container {
  const group = new Container();
  group.label = edge.id;
  group.eventMode = "auto";

  const gfx = new Graphics();
  gfx.label = "edge-line";
  gfx.eventMode = "static";
  gfx.cursor = edge.fileLink ? "pointer" : "default";

  const text = new PixiText({
    text: edge.label || "",
    resolution: 2,
    style: new TextStyle({
      fontSize: 14,
      fontFamily: "sans-serif",
      fill: labelColor,
      align: "center",
    }),
  });
  text.label = "edge-label";
  text.anchor.set(0.5, 0.5);
  text.eventMode = "none";
  if (!edge.label) text.visible = false;

  group.addChild(gfx);
  group.addChild(text);

  let lastClickTime = 0;

  gfx.on("pointerdown", (e) => {
    e.stopPropagation();

    const onUp = () => {
      gfx.off("pointerup", onUp);
      gfx.off("pointerupoutside", onUp);

      const now = Date.now();
      if (now - lastClickTime < DOUBLE_CLICK_MS) {
        lastClickTime = 0;
        callbacks.onDoubleClick(edge.id, group);
      } else {
        lastClickTime = now;
        callbacks.onSelect(edge.id);
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
  labelColor: string
): void {
  const gfx = group.getChildByLabel("edge-line") as Graphics;
  const text = group.getChildByLabel("edge-label") as PixiText;

  gfx.clear();
  gfx.cursor = edge.fileLink ? "pointer" : "default";

  const from = resolveEndpoint(edge.from, nodeMap);
  const to = resolveEndpoint(edge.to, nodeMap);
  if (!from || !to) return;

  const color = colorToHex(edge.color, DEFAULT_EDGE_COLOR);
  const lineWidth = 2;
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

  // Draw selection overlay
  if (isSelected) {
    drawDashedLine(gfx, from.x, from.y, to.x, to.y, 3, SELECTED_EDGE_COLOR, "dashed");
  }

  // Hit area for click detection (wider than the visual line)
  const tolerance = HIT_TOLERANCE / viewportScale;
  gfx.hitArea = new LineHitArea(from.x, from.y, to.x, to.y, Math.max(tolerance, HIT_TOLERANCE));

  // Update label — always position at midpoint so toGlobal works for editing
  text.position.set((from.x + to.x) / 2, (from.y + to.y) / 2);
  const labelText = edge.label || "";
  if (labelText) {
    text.text = labelText;
    text.style.fill = edge.labelColor ?? labelColor;
    text.visible = true;
  } else {
    text.visible = false;
  }
}

export function updateEdgeTextResolution(group: Container, resolution: number): void {
  const text = group.getChildByLabel("edge-label") as PixiText | null;
  if (text && text.resolution !== resolution) {
    text.resolution = resolution;
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
