import type { Container } from "pixi.js";
import type { Bounds, EdgeEndpoint } from "../../schema";
import { getState } from "../state";
import { GRID_SIZE, snap } from "../controls/gridSnap";
import { resolveAnchor } from "./canvasEdge";
import { getContainerBounds } from "./canvasNode";

export const DOT_RADIUS = 5;
export const DOT_COLOR_EMPTY = 0x4488ff;
export const DOT_COLOR_NODE = 0xff4444;

export type HitNodeInfo = Bounds & { nodeId: string };

/** Hit-test all document nodes at a world coordinate, returning the topmost match. */
export function findNodeAtPoint(worldX: number, worldY: number, viewport: Container): HitNodeInfo | null {
  const doc = getState().document;
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const n = doc.nodes[i];
    const container = viewport.getChildByLabel(n.id) as Container | null;
    const b = container ? getContainerBounds(container) : n.bounds;
    if (worldX >= b.x && worldX <= b.x + b.width && worldY >= b.y && worldY <= b.y + b.height) {
      return { nodeId: n.id, ...b };
    }
  }
  return null;
}

/** Compute a proportional anchor [0..1, 0..1] within a node rect, with optional grid snapping. */
export function computeAnchor(clickX: number, clickY: number, node: Bounds): [number, number] {
  let ax = (clickX - node.x) / node.width;
  let ay = (clickY - node.y) / node.height;
  if (getState().snapToGrid) {
    const gridStepX = GRID_SIZE / node.width;
    const gridStepY = GRID_SIZE / node.height;
    if (gridStepX > 0) ax = Math.round(ax / gridStepX) * gridStepX;
    if (gridStepY > 0) ay = Math.round(ay / gridStepY) * gridStepY;
  }
  ax = Math.max(0, Math.min(1, ax));
  ay = Math.max(0, Math.min(1, ay));
  ax = Math.round(ax * 1000) / 1000;
  ay = Math.round(ay * 1000) / 1000;
  return [ax, ay];
}

/** Build an EdgeEndpoint from a world position: snaps to a node if hit, otherwise a free-point.
 *  Snaps coordinates before hit-testing so a grid-snapped position on a node edge is detected. */
export function buildEndpoint(worldX: number, worldY: number, viewport: Container): { endpoint: EdgeEndpoint; resolved: { x: number; y: number } } {
  const sx = getState().snapToGrid ? snap(worldX) : worldX;
  const sy = getState().snapToGrid ? snap(worldY) : worldY;
  const hitNode = findNodeAtPoint(sx, sy, viewport);
  if (hitNode) {
    const anchor = computeAnchor(sx, sy, hitNode);
    const resolved = resolveAnchor(hitNode, anchor);
    return { endpoint: { nodeId: hitNode.nodeId, anchor }, resolved };
  }
  return { endpoint: { x: sx, y: sy }, resolved: { x: sx, y: sy } };
}
