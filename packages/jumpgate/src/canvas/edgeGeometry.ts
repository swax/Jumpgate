import type { Bounds, EdgeEndpoint } from "../schema";

export type Point = { x: number; y: number };

/** Convert a pixel-offset anchor [px, px] from node top-left to world coordinates. */
export function resolveAnchor(node: Bounds, anchor?: [number, number]): { x: number; y: number } {
  const ax = anchor ? anchor[0] : node.width / 2;
  const ay = anchor ? anchor[1] : node.height / 2;
  return {
    x: node.x + ax,
    y: node.y + ay,
  };
}

/** Resolve an endpoint to world coordinates. Node-anchored endpoints use the node + anchor; free-point endpoints use x/y directly. */
export function resolveEndpoint(
  endpoint: EdgeEndpoint,
  nodeMap: Map<string, Bounds>,
): { x: number; y: number } | null {
  if ("nodeId" in endpoint) {
    const node = nodeMap.get(endpoint.nodeId);
    if (!node) return null;
    return resolveAnchor(node, endpoint.anchor);
  }
  return { x: endpoint.x, y: endpoint.y };
}

/** Build the full polyline: [from, ...waypoints, to]. */
export function buildPolylinePoints(from: Point, to: Point, waypoints?: Point[]): Point[] {
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
  y2: number,
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

/** Custom hit area checking point-to-segment distance across all polyline segments,
 *  plus an optional label bounding rect. */
export class PolylineHitArea {
  labelRect: { x: number; y: number; width: number; height: number } | null = null;

  /**
   * @param points        dense path used for containment (may be a flattened curve so the
   *                      clickable region hugs the visible edge)
   * @param tolerance     half-width of the clickable band, in world units
   * @param segmentPoints coarse path (endpoints + waypoints) used for drag segment mapping;
   *                      defaults to `points` when the edge has no separate flattened form
   */
  constructor(
    private points: Point[],
    private tolerance: number,
    private segmentPoints: Point[] = points,
  ) {}

  findSegmentIndex(x: number, y: number): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 1; i < this.segmentPoints.length; i++) {
      const dist = pointToSegmentDistance(
        x,
        y,
        this.segmentPoints[i - 1].x,
        this.segmentPoints[i - 1].y,
        this.segmentPoints[i].x,
        this.segmentPoints[i].y,
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i - 1;
      }
    }
    return bestIdx;
  }

  contains(x: number, y: number): boolean {
    if (this.labelRect) {
      const r = this.labelRect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        return true;
      }
    }
    for (let i = 1; i < this.points.length; i++) {
      const dist = pointToSegmentDistance(
        x,
        y,
        this.points[i - 1].x,
        this.points[i - 1].y,
        this.points[i].x,
        this.points[i].y,
      );
      if (dist <= this.tolerance) return true;
    }
    return false;
  }
}
