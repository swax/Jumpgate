import type { FileLink, Node } from "./schema";

export type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  borderColor?: string;
  label?: string;
  shape?: Node["shape"];
  direction?: Node["direction"];
  parentId?: string | null;
  fileLink?: FileLink;
};

export function colorToHex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  return parseInt(color.replace("#", ""), 16);
}

export const DOUBLE_CLICK_MS = 400;
export const DRAG_THRESHOLD = 4;
