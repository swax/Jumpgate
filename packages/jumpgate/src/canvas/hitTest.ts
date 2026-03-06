import type { Container } from "pixi.js";
import type { Bounds } from "../schema";
import { getState } from "../state";
import { getContainerBounds } from "./canvasNode";

export type HitNodeInfo = Bounds & { nodeId: string };

/** Pure bounds-based hit test — no pixi dependency. */
export function findNodeInBounds(
  worldX: number,
  worldY: number,
  nodes: { id: string; bounds: Bounds }[],
  excludeIds?: Set<string>
): HitNodeInfo | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (excludeIds?.has(n.id)) continue;
    const b = n.bounds;
    if (worldX >= b.x && worldX <= b.x + b.width && worldY >= b.y && worldY <= b.y + b.height) {
      return { nodeId: n.id, ...b };
    }
  }
  return null;
}

/** Hit-test using live container bounds from the pixi viewport. */
export function findNodeAtPoint(
  worldX: number,
  worldY: number,
  viewport: Container,
  excludeIds?: Set<string>
): HitNodeInfo | null {
  const doc = getState().document;
  const nodes = doc.nodes.map(n => {
    const container = viewport.getChildByLabel(n.id) as Container | null;
    return { id: n.id, bounds: container ? getContainerBounds(container) : n.bounds };
  });
  return findNodeInBounds(worldX, worldY, nodes, excludeIds);
}
