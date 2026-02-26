import type { Node } from "../schema";

export type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  label?: string;
  shape?: Node["shape"];
  direction?: Node["direction"];
  parentId?: string | null;
};

export function colorToHex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  return parseInt(color.replace("#", ""), 16);
}

export const DOUBLE_CLICK_MS = 400;
export const DRAG_THRESHOLD = 4;
