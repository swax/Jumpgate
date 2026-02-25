import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../../schema";
import { resolveEndpoint } from "./canvasEdge";
import { DOT_RADIUS, DOT_COLOR_EMPTY, DOT_COLOR_NODE, findNodeAtPoint, computeAnchor, buildEndpoint } from "./edgeUtils";
import { resolveAnchor } from "./canvasEdge";
import { getState } from "../state";
import { snap } from "../controls/gridSnap";

export interface EdgeHandleCallbacks {
  onEdgeChanged: (id: string, changes: Partial<Pick<Edge, "from" | "to">>) => void;
  onDragMove: () => void;
}

export class EdgeHandleOverlay {
  public container: Container;

  private fromHandle: Graphics;
  private toHandle: Graphics;
  private callbacks: EdgeHandleCallbacks;
  private viewportGetter: () => Container;
  private isDragging = false;
  private dragEdgeId: string | null = null;
  private dragWhich: "from" | "to" | null = null;
  private dragEndpoint: EdgeEndpoint | null = null;

  constructor(viewportGetter: () => Container, callbacks: EdgeHandleCallbacks) {
    this.viewportGetter = viewportGetter;
    this.callbacks = callbacks;

    this.container = new Container();
    this.container.label = "__edge-handle-overlay__";
    this.container.eventMode = "passive";

    this.fromHandle = this.createHandle("from");
    this.toHandle = this.createHandle("to");

    this.container.addChild(this.fromHandle);
    this.container.addChild(this.toHandle);
  }

  private createHandle(which: "from" | "to"): Graphics {
    const handle = new Graphics();
    handle.label = `edge-handle-${which}`;
    handle.eventMode = "static";
    handle.cursor = "grab";
    handle.visible = false;

    handle.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.startDrag(handle, which, e);
    });

    return handle;
  }

  /** Returns the in-flight endpoint override during a handle drag, or null. */
  getEndpointOverride(): { edgeId: string; which: "from" | "to"; endpoint: EdgeEndpoint } | null {
    if (!this.isDragging || !this.dragEdgeId || !this.dragWhich || !this.dragEndpoint) return null;
    return { edgeId: this.dragEdgeId, which: this.dragWhich, endpoint: this.dragEndpoint };
  }

  private startDrag(handle: Graphics, which: "from" | "to", e: FederatedPointerEvent): void {
    this.isDragging = true;
    handle.cursor = "grabbing";

    const viewport = this.viewportGetter();
    const edgeId = (this.container as any)._activeEdgeId as string;
    this.dragEdgeId = edgeId;
    this.dragWhich = which;

    const onMove = (me: FederatedPointerEvent) => {
      const worldPos = viewport.toLocal(me.global);
      const { endpoint } = buildEndpoint(worldPos.x, worldPos.y, viewport);
      this.dragEndpoint = endpoint;

      const sx = getState().snapToGrid ? snap(worldPos.x) : worldPos.x;
      const sy = getState().snapToGrid ? snap(worldPos.y) : worldPos.y;
      const hitNode = findNodeAtPoint(sx, sy, viewport);

      let posX: number;
      let posY: number;
      let color: number;

      if (hitNode) {
        const anchor = computeAnchor(sx, sy, hitNode);
        const resolved = resolveAnchor(hitNode, anchor);
        posX = resolved.x;
        posY = resolved.y;
        color = DOT_COLOR_NODE;
      } else {
        posX = sx;
        posY = sy;
        color = DOT_COLOR_EMPTY;
      }

      handle.position.set(posX, posY);
      const r = DOT_RADIUS / viewport.scale.x;
      handle.clear();
      handle.circle(0, 0, r).fill(color).stroke({ width: 1.5 / viewport.scale.x, color: 0xffffff });
      const hitR = r * 3;
      handle.hitArea = {
        contains: (px: number, py: number) => px * px + py * py <= hitR * hitR,
      };

      this.callbacks.onDragMove();
    };

    const onUp = (ue: FederatedPointerEvent) => {
      handle.off("globalpointermove", onMove);
      handle.off("pointerup", onUp);
      handle.off("pointerupoutside", onUp);

      const worldPos = viewport.toLocal(ue.global);
      const { endpoint } = buildEndpoint(worldPos.x, worldPos.y, viewport);

      this.dragEndpoint = null;
      this.dragEdgeId = null;
      this.dragWhich = null;
      this.isDragging = false;
      handle.cursor = "grab";

      this.callbacks.onEdgeChanged(edgeId, { [which]: endpoint });
    };

    handle.on("globalpointermove", onMove);
    handle.on("pointerup", onUp);
    handle.on("pointerupoutside", onUp);
  }

  update(
    edges: Edge[],
    selectedEdgeIds: string[],
    nodeMap: Map<string, Bounds>,
    viewportScale: number,
    locked: boolean,
    edgeMode: boolean
  ): void {
    // Only show handles when exactly 1 edge is selected, not locked, not in edge mode, not mid-drag
    if (
      selectedEdgeIds.length !== 1 ||
      locked ||
      edgeMode ||
      this.isDragging
    ) {
      if (!this.isDragging) {
        this.fromHandle.visible = false;
        this.toHandle.visible = false;
      }
      return;
    }

    const edgeId = selectedEdgeIds[0];
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) {
      this.fromHandle.visible = false;
      this.toHandle.visible = false;
      return;
    }

    (this.container as any)._activeEdgeId = edgeId;

    const fromPos = resolveEndpoint(edge.from, nodeMap);
    const toPos = resolveEndpoint(edge.to, nodeMap);
    if (!fromPos || !toPos) {
      this.fromHandle.visible = false;
      this.toHandle.visible = false;
      return;
    }

    this.drawHandle(this.fromHandle, fromPos.x, fromPos.y, edge.from, viewportScale);
    this.drawHandle(this.toHandle, toPos.x, toPos.y, edge.to, viewportScale);
  }

  private drawHandle(
    handle: Graphics,
    x: number,
    y: number,
    endpoint: EdgeEndpoint,
    viewportScale: number
  ): void {
    const r = DOT_RADIUS / viewportScale;
    const color = "nodeId" in endpoint ? DOT_COLOR_NODE : DOT_COLOR_EMPTY;

    handle.clear();
    handle.circle(0, 0, r).fill(color).stroke({ width: 1.5 / viewportScale, color: 0xffffff });
    handle.position.set(x, y);
    handle.visible = true;

    const hitR = r * 3;
    handle.hitArea = {
      contains: (px: number, py: number) => px * px + py * py <= hitR * hitR,
    };
  }
}
