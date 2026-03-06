import type { Container } from "pixi.js";
import type { Bounds, EdgeEndpoint } from "../schema";
import { GRID_SIZE, snap } from "../controls/gridSnap";
import { resolveAnchor } from "./edgeGeometry";
import { findNodeAtPoint } from "./hitTest";

export const DOT_RADIUS = 5;
export const DOT_COLOR_EMPTY = 0x4488ff;
export const DOT_COLOR_NODE = 0xff4444;

/** Compute a pixel-offset anchor [px, px] from node top-left, with optional grid snapping. */
export function computeAnchor(
  clickX: number,
  clickY: number,
  node: Bounds,
  snapToGrid: boolean,
): [number, number] {
  let ax = clickX - node.x;
  let ay = clickY - node.y;
  if (snapToGrid) {
    ax = Math.round(ax / GRID_SIZE) * GRID_SIZE;
    ay = Math.round(ay / GRID_SIZE) * GRID_SIZE;
  }
  ax = Math.max(0, Math.min(node.width, ax));
  ay = Math.max(0, Math.min(node.height, ay));
  ax = Math.round(ax);
  ay = Math.round(ay);
  return [ax, ay];
}

/** Build an EdgeEndpoint from a world position: snaps to a node if hit, otherwise a free-point.
 *  Snaps coordinates before hit-testing so a grid-snapped position on a node edge is detected. */
export function buildEndpoint(
  worldX: number,
  worldY: number,
  viewport: Container,
  snapToGrid: boolean,
): { endpoint: EdgeEndpoint; resolved: { x: number; y: number } } {
  const sx = snapToGrid ? snap(worldX) : worldX;
  const sy = snapToGrid ? snap(worldY) : worldY;
  const hitNode = findNodeAtPoint(sx, sy, viewport);
  if (hitNode) {
    const anchor = computeAnchor(sx, sy, hitNode, snapToGrid);
    const resolved = resolveAnchor(hitNode, anchor);
    return { endpoint: { nodeId: hitNode.nodeId, anchor }, resolved };
  }
  return { endpoint: { x: sx, y: sy }, resolved: { x: sx, y: sy } };
}
