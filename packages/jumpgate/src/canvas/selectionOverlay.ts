import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import type { Bounds } from "../schema";
import type { NodeChanges } from "../shared";
import { snap, GRID_SIZE } from "../controls/gridSnap";
import { setContainerBounds } from "./canvasNode";
import { drawShape, drawGlowLayer, drawNebulaBg } from "./shapes";

import { getNodeRectMeta } from "./metadata";

export interface SelectionOverlayCallbacks {
  onNodeChanged: (id: string, changes: NodeChanges) => void;
  onNodesChanged: (updates: { id: string; changes: NodeChanges }[]) => void;
  isSnapEnabled: () => boolean;
  onDragUpdate: () => void;
}

type NodeInfo = Bounds & { id: string };

const HANDLE_SIZE = 8;
const HANDLE_COLOR = 0x4a90d9;
const OUTLINE_COLOR = 0x4da3ff;
const SPACE_HANDLE_COLOR = 0x00FFAA;
const SPACE_OUTLINE_COLOR = 0x00FFAA;

type HandleId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export class SelectionOverlay {
  public container: Container;

  private outline: Graphics;
  private handles: Map<HandleId, Graphics> = new Map();
  private callbacks: SelectionOverlayCallbacks;
  private viewportGetter: () => Container;

  private selectedNodes: NodeInfo[] = [];
  private bbox = { x: 0, y: 0, width: 0, height: 0 };
  private theme: string | undefined;

  // Drag state for handles
  private activeHandle: HandleId | null = null;
  private dragStartBbox = { x: 0, y: 0, width: 0, height: 0 };
  private dragStartPointer = { x: 0, y: 0 };

  constructor(
    viewportGetter: () => Container,
    callbacks: SelectionOverlayCallbacks
  ) {
    this.callbacks = callbacks;
    this.viewportGetter = viewportGetter;

    this.container = new Container();
    this.container.label = "__selection_overlay__";
    this.container.eventMode = "passive";

    this.outline = new Graphics();
    this.outline.eventMode = "none";
    this.container.addChild(this.outline);

    const handleIds: HandleId[] = [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

    for (const hid of handleIds) {
      const handle = new Graphics();
      handle.label = hid;
      handle.eventMode = "static";
      handle.cursor = this.getCursor(hid);
      handle.visible = false;

      handle.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.activeHandle = hid;
        const viewport = this.viewportGetter();
        const local = viewport.toLocal(e.global);
        this.dragStartPointer = { x: local.x, y: local.y };
        this.dragStartBbox = { ...this.bbox };

        const onMove = (me: FederatedPointerEvent) => {
          if (!this.activeHandle) return;
          const localPt = viewport.toLocal(me.global);
          this.onHandleMove(localPt.x, localPt.y);
        };

        const onUp = () => {
          if (this.activeHandle) {
            this.commitResize();
            this.activeHandle = null;
          }
          handle.off("globalpointermove", onMove);
          handle.off("pointerup", onUp);
          handle.off("pointerupoutside", onUp);
        };

        handle.on("globalpointermove", onMove);
        handle.on("pointerup", onUp);
        handle.on("pointerupoutside", onUp);
      });

      this.handles.set(hid, handle);
      this.container.addChild(handle);
    }
  }

  private getCursor(hid: HandleId): string {
    switch (hid) {
      case "top-left":
      case "bottom-right":
        return "nwse-resize";
      case "top-right":
      case "bottom-left":
        return "nesw-resize";
      case "top-center":
      case "bottom-center":
        return "ns-resize";
      case "middle-left":
      case "middle-right":
        return "ew-resize";
    }
  }

  update(nodes: NodeInfo[], viewportScale: number, theme?: string, locked = false): void {
    this.theme = theme;
    this.selectedNodes = nodes;

    if (nodes.length === 0) {
      this.outline.clear();
      for (const h of this.handles.values()) h.visible = false;
      return;
    }

    if (nodes.length === 1) {
      const n = nodes[0];
      this.bbox = { x: n.x, y: n.y, width: n.width, height: n.height };
      if (locked) {
        // Locked mode: solid outline, no resize handles
        this.drawSolidOutline(viewportScale);
        for (const h of this.handles.values()) h.visible = false;
      } else {
        // Edit mode: dashed outline + resize handles
        this.drawOutline(viewportScale);
        this.drawHandles(viewportScale);
      }
    } else {
      // Multi-select: individual outlines per node, no resize handles
      if (locked) {
        this.drawSolidMultiOutlines(nodes, viewportScale);
      } else {
        this.drawMultiOutlines(nodes, viewportScale);
      }
      for (const h of this.handles.values()) h.visible = false;
    }
  }

  private drawDashedLine(
    x1: number, y1: number, x2: number, y2: number,
    dashLen: number, gapLen: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ux = dx / len;
    const uy = dy / len;
    let pos = 0;
    let drawing = true;
    while (pos < len) {
      const seg = drawing ? dashLen : gapLen;
      const end = Math.min(pos + seg, len);
      if (drawing) {
        this.outline.moveTo(x1 + ux * pos, y1 + uy * pos);
        this.outline.lineTo(x1 + ux * end, y1 + uy * end);
      }
      pos = end;
      drawing = !drawing;
    }
  }

  private drawDashedRect(
    x: number, y: number, width: number, height: number,
    dashLen: number, gapLen: number
  ): void {
    this.drawDashedLine(x, y, x + width, y, dashLen, gapLen);
    this.drawDashedLine(x + width, y, x + width, y + height, dashLen, gapLen);
    this.drawDashedLine(x + width, y + height, x, y + height, dashLen, gapLen);
    this.drawDashedLine(x, y + height, x, y, dashLen, gapLen);
  }

  private drawSolidOutline(viewportScale: number): void {
    const { x, y, width, height } = this.bbox;
    const lineWidth = 2.5 / viewportScale;
    const outlineColor = this.theme === "space" ? SPACE_OUTLINE_COLOR : OUTLINE_COLOR;

    this.outline.clear();
    this.outline.rect(x, y, width, height);
    this.outline.stroke({ width: lineWidth, color: outlineColor });
  }

  private drawSolidMultiOutlines(nodes: NodeInfo[], viewportScale: number): void {
    const lineWidth = 2.5 / viewportScale;
    const outlineColor = this.theme === "space" ? SPACE_OUTLINE_COLOR : OUTLINE_COLOR;

    this.outline.clear();
    for (const n of nodes) {
      this.outline.rect(n.x, n.y, n.width, n.height);
    }
    this.outline.stroke({ width: lineWidth, color: outlineColor });
  }

  private drawOutline(viewportScale: number): void {
    const { x, y, width, height } = this.bbox;
    const lineWidth = 2.5 / viewportScale;
    const dashLen = 8 / viewportScale;
    const gapLen = 4 / viewportScale;
    const outlineColor = this.theme === "space" ? SPACE_OUTLINE_COLOR : OUTLINE_COLOR;

    this.outline.clear();
    this.outline.setStrokeStyle({ width: lineWidth, color: outlineColor });
    this.drawDashedRect(x, y, width, height, dashLen, gapLen);
    this.outline.stroke();
  }

  private drawMultiOutlines(nodes: NodeInfo[], viewportScale: number): void {
    const lineWidth = 2.5 / viewportScale;
    const dashLen = 8 / viewportScale;
    const gapLen = 4 / viewportScale;
    const outlineColor = this.theme === "space" ? SPACE_OUTLINE_COLOR : OUTLINE_COLOR;

    this.outline.clear();
    this.outline.setStrokeStyle({ width: lineWidth, color: outlineColor });
    for (const n of nodes) {
      this.drawDashedRect(n.x, n.y, n.width, n.height, dashLen, gapLen);
    }
    this.outline.stroke();
  }

  private drawHandles(viewportScale: number): void {
    const { x, y, width, height } = this.bbox;
    const hs = HANDLE_SIZE / viewportScale;

    const rawPositions: Record<HandleId, { x: number; y: number }> = {
      "top-left": { x, y },
      "top-center": { x: x + width / 2, y },
      "top-right": { x: x + width, y },
      "middle-left": { x, y: y + height / 2 },
      "middle-right": { x: x + width, y: y + height / 2 },
      "bottom-left": { x, y: y + height },
      "bottom-center": { x: x + width / 2, y: y + height },
      "bottom-right": { x: x + width, y: y + height },
    };

    const handleColor = this.theme === "space" ? SPACE_HANDLE_COLOR : HANDLE_COLOR;
    for (const [hid, handle] of this.handles) {
      const pos = rawPositions[hid];
      handle.clear();
      handle.rect(-hs / 2, -hs / 2, hs, hs).fill(handleColor).stroke({ width: 1 / viewportScale, color: 0xffffff });
      handle.position.set(pos.x, pos.y);
      handle.visible = true;
      // Make hit area larger for easier grabbing
      handle.hitArea = { contains: (px: number, py: number) => px >= -hs && px <= hs && py >= -hs && py <= hs };
    }
  }

  private onHandleMove(pointerX: number, pointerY: number): void {
    const dx = pointerX - this.dragStartPointer.x;
    const dy = pointerY - this.dragStartPointer.y;

    const sb = this.dragStartBbox;

    let newX = sb.x;
    let newY = sb.y;
    let newW = sb.width;
    let newH = sb.height;

    const hid = this.activeHandle!;
    const minSize = this.callbacks.isSnapEnabled() ? GRID_SIZE : 10;

    // Apply delta based on handle
    if (hid.includes("left")) {
      newX = sb.x + dx;
      newW = sb.width - dx;
      if (newW < minSize) {
        newW = minSize;
        newX = sb.x + sb.width - minSize;
      }
    }
    if (hid.includes("right")) {
      newW = sb.width + dx;
      if (newW < minSize) newW = minSize;
    }
    if (hid.startsWith("top")) {
      newY = sb.y + dy;
      newH = sb.height - dy;
      if (newH < minSize) {
        newH = minSize;
        newY = sb.y + sb.height - minSize;
      }
    }
    if (hid.startsWith("bottom")) {
      newH = sb.height + dy;
      if (newH < minSize) newH = minSize;
    }

    // Snap
    if (this.callbacks.isSnapEnabled()) {
      newX = snap(newX);
      newY = snap(newY);
      newW = Math.max(GRID_SIZE, snap(newW));
      newH = Math.max(GRID_SIZE, snap(newH));

      // Re-anchor if needed
      if (hid.includes("left")) {
        newX = snap(sb.x + sb.width) - newW;
      }
      if (hid.startsWith("top")) {
        newY = snap(sb.y + sb.height) - newH;
      }
    }

    this.bbox = { x: newX, y: newY, width: newW, height: newH };

    // Live preview: update node positions/sizes visually
    this.applyToNodes(false);

    const viewport = this.viewportGetter();
    this.drawOutline(viewport.scale.x);
    this.drawHandles(viewport.scale.x);

    this.callbacks.onDragUpdate();
  }

  private applyToNodes(commit: boolean): void {
    const viewport = this.viewportGetter();
    const sb = this.dragStartBbox;

    if (this.selectedNodes.length === 1) {
      const node = this.selectedNodes[0];
      const container = viewport.getChildByLabel(node.id) as Container | null;
      if (container) {
        const newX = Math.round(this.bbox.x);
        const newY = Math.round(this.bbox.y);
        const newW = Math.round(this.bbox.width);
        const newH = Math.round(this.bbox.height);

        const newBounds = { x: newX, y: newY, width: newW, height: newH };
        setContainerBounds(container, newBounds);

        // Update graphics
        const glow = container.getChildByLabel("node-glow") as Graphics | null;
        const rect = container.getChildByLabel("node-rect") as Graphics;
        if (rect) {
          const rectMeta = getNodeRectMeta(rect);
          const fill = rectMeta?.fillColor ?? null;
          const strokeClr = rectMeta?.strokeColor ?? null;
          const shape = rectMeta?.nodeShape;
          const dir = rectMeta?.nodeDirection;
          const isGroup = glow ? (glow as Graphics & { __isGroup?: boolean }).__isGroup ?? false : false;
          const isSpace = this.theme === "space";
          rect.clear();
          if (isGroup && isSpace && fill !== null) {
            drawNebulaBg(rect, newW, newH, fill);
          } else {
            drawShape(rect, newW, newH, shape, fill, strokeClr, dir, this.theme);
          }
          // Rebuild glow layer to match new size (space only)
          if (glow && isSpace && fill !== null && (isGroup || shape !== "text")) {
            glow.clear();
            drawGlowLayer(glow, newW, newH, fill);
          } else if (glow && !isSpace) {
            glow.clear();
          }
        }

        if (commit) {
          this.callbacks.onNodeChanged(node.id, { bounds: newBounds });
        }
      }
    } else if (this.selectedNodes.length > 1) {
      // Scale proportionally within bounding box
      const scaleX = sb.width > 0 ? this.bbox.width / sb.width : 1;
      const scaleY = sb.height > 0 ? this.bbox.height / sb.height : 1;
      const updates: { id: string; changes: NodeChanges }[] = [];

      for (const node of this.selectedNodes) {
        const relX = node.x - sb.x;
        const relY = node.y - sb.y;
        const newBounds = {
          x: Math.round(this.bbox.x + relX * scaleX),
          y: Math.round(this.bbox.y + relY * scaleY),
          width: Math.round(node.width * scaleX),
          height: Math.round(node.height * scaleY),
        };

        const container = viewport.getChildByLabel(node.id) as Container | null;
        if (container) {
          setContainerBounds(container, newBounds);

          const glow = container.getChildByLabel("node-glow") as Graphics | null;
          const rect = container.getChildByLabel("node-rect") as Graphics;
          if (rect) {
            const rectMeta = getNodeRectMeta(rect);
            const fill = rectMeta?.fillColor ?? 0x888888;
            const strokeClr = rectMeta?.strokeColor ?? 0x333333;
            const shape = rectMeta?.nodeShape;
            const dir = rectMeta?.nodeDirection;
            const isGroup = glow ? (glow as Graphics & { __isGroup?: boolean }).__isGroup ?? false : false;
            const isSpace = this.theme === "space";
            rect.clear();
            if (isGroup && isSpace && fill !== null) {
              drawNebulaBg(rect, newBounds.width, newBounds.height, fill);
            } else {
              drawShape(rect, newBounds.width, newBounds.height, shape, fill, strokeClr, dir, this.theme);
            }
            if (glow && isSpace && fill !== null && (isGroup || shape !== "text")) {
              glow.clear();
              drawGlowLayer(glow, newBounds.width, newBounds.height, fill);
            } else if (glow && !isSpace) {
              glow.clear();
            }
          }
        }

        if (commit) {
          updates.push({ id: node.id, changes: { bounds: newBounds } });
        }
      }

      if (commit && updates.length > 0) {
        this.callbacks.onNodesChanged(updates);
      }
    }
  }

  private commitResize(): void {
    this.applyToNodes(true);
  }
}
