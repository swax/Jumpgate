import type { Container } from "pixi.js";
import type { Bounds, EdgeEndpoint } from "../../schema";
import { GRID_SIZE, snap } from "../controls/gridSnap";
import { resolveAnchor } from "./edgeGeometry";
import { findNodeAtPoint } from "./hitTest";

export const DOT_RADIUS = 5;
export const DOT_COLOR_EMPTY = 0x4488ff;
export const DOT_COLOR_NODE = 0xff4444;

/** Compute a proportional anchor [0..1, 0..1] within a node rect, with optional grid snapping. */
export function computeAnchor(clickX: number, clickY: number, node: Bounds, snapToGrid: boolean): [number, number] {
  let ax = (clickX - node.x) / node.width;
  let ay = (clickY - node.y) / node.height;
  if (snapToGrid) {
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
export function buildEndpoint(worldX: number, worldY: number, viewport: Container, snapToGrid: boolean): { endpoint: EdgeEndpoint; resolved: { x: number; y: number } } {
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
