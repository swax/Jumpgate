import { Container, Graphics, FederatedPointerEvent } from "pixi.js";
import type { Bounds, Edge, EdgeEndpoint } from "../../schema";
import { DOUBLE_CLICK_MS } from "../shared";
import { resolveEndpoint } from "./canvasEdge";
import { DOT_RADIUS, DOT_COLOR_EMPTY, DOT_COLOR_NODE, findNodeAtPoint, computeAnchor, buildEndpoint } from "./edgeUtils";
import { resolveAnchor } from "./canvasEdge";
import { getState, getEdgeById } from "../state";
import { snap } from "../controls/gridSnap";
import { getEdgeHandleMeta, setEdgeHandleMeta, getWaypointMeta, setWaypointMeta } from "./metadata";
const MERGE_DISTANCE = 15;

export interface EdgeHandleCallbacks {
  onEdgeChanged: (id: string, changes: Partial<Pick<Edge, "from" | "to" | "waypoints">>) => void;
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

  // Waypoint handle pool
  private waypointHandles: Graphics[] = [];
  private dragWaypointEdgeId: string | null = null;
  private dragWaypoints: { x: number; y: number }[] | null = null;
  private isDraggingWaypoint = false;

  // Current edge context for waypoint listeners (updated each render cycle)
  private currentEdgeId: string | null = null;
  private currentNodeMap: Map<string, Bounds> | null = null;

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

  /** Returns the in-flight waypoints override during a waypoint drag, or null. */
  getWaypointOverrides(): { edgeId: string; waypoints: { x: number; y: number }[] } | null {
    if (!this.isDraggingWaypoint || !this.dragWaypointEdgeId || !this.dragWaypoints) return null;
    return { edgeId: this.dragWaypointEdgeId, waypoints: this.dragWaypoints };
  }

  /** Insert a waypoint at the given segment index and position. */
  insertWaypoint(edgeId: string, segmentIndex: number, point: { x: number; y: number }): void {
    const edge = getEdgeById(edgeId);
    if (!edge) return;

    const existing = edge.waypoints ? [...edge.waypoints] : [];
    existing.splice(segmentIndex, 0, point);
    this.callbacks.onEdgeChanged(edgeId, { waypoints: existing });
  }

  private startDrag(handle: Graphics, which: "from" | "to", e: FederatedPointerEvent): void {
    this.isDragging = true;
    handle.cursor = "grabbing";

    const viewport = this.viewportGetter();
    const edgeId = getEdgeHandleMeta(this.container)!.activeEdgeId;
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

  private ensureWaypointHandles(count: number): void {
    // Create handles as needed, attaching listener once
    while (this.waypointHandles.length < count) {
      const handle = new Graphics();
      handle.label = `edge-handle-wp-${this.waypointHandles.length}`;
      handle.eventMode = "static";
      handle.cursor = "grab";
      handle.visible = false;
      this.container.addChild(handle);
      this.waypointHandles.push(handle);

      // Attach listener once — reads metadata dynamically
      handle.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        const wpMeta = getWaypointMeta(handle);
        if (!wpMeta) return;
        const wpIndex = wpMeta.wpIndex;
        const edgeId = this.currentEdgeId;
        if (!edgeId) return;
        const edge = getEdgeById(edgeId);
        if (!edge) return;

        const isCtrl = e.ctrlKey || e.metaKey;

        if (isCtrl) {
          const lastCtrl = wpMeta.lastCtrlClickTime;
          const now = Date.now();
          if (now - lastCtrl < DOUBLE_CLICK_MS) {
            setWaypointMeta(handle, { wpIndex, lastCtrlClickTime: 0 });
            this.removeWaypoint(edgeId, wpIndex);
          } else {
            setWaypointMeta(handle, { wpIndex, lastCtrlClickTime: now });
          }
          return;
        }

        this.startWaypointDrag(handle, wpIndex, edge, this.currentNodeMap!, e);
      });
    }

    // Show/hide handles
    for (let i = 0; i < this.waypointHandles.length; i++) {
      this.waypointHandles[i].visible = i < count;
    }
  }

  private hideWaypointHandles(): void {
    for (const h of this.waypointHandles) {
      h.visible = false;
    }
  }

  private updateWaypointMeta(handle: Graphics, wpIndex: number): void {
    setWaypointMeta(handle, {
      wpIndex,
      lastCtrlClickTime: getWaypointMeta(handle)?.lastCtrlClickTime ?? 0,
    });
  }

  private removeWaypoint(edgeId: string, wpIndex: number): void {
    const edge = getEdgeById(edgeId);
    if (!edge || !edge.waypoints) return;

    const updated = [...edge.waypoints];
    updated.splice(wpIndex, 1);
    this.callbacks.onEdgeChanged(edgeId, { waypoints: updated.length > 0 ? updated : undefined });
  }

  private startWaypointDrag(
    handle: Graphics,
    wpIndex: number,
    edge: Edge,
    nodeMap: Map<string, Bounds>,
    e: FederatedPointerEvent
  ): void {
    this.isDraggingWaypoint = true;
    this.dragWaypointEdgeId = edge.id;
    this.dragWaypoints = edge.waypoints ? [...edge.waypoints] : [];
    handle.cursor = "grabbing";

    const viewport = this.viewportGetter();

    // Resolve from/to for merge detection
    const fromPos = resolveEndpoint(edge.from, nodeMap);
    const toPos = resolveEndpoint(edge.to, nodeMap);

    const onMove = (me: FederatedPointerEvent) => {
      const worldPos = viewport.toLocal(me.global);
      const sx = getState().snapToGrid ? snap(worldPos.x) : worldPos.x;
      const sy = getState().snapToGrid ? snap(worldPos.y) : worldPos.y;

      // Update in-flight waypoints
      if (this.dragWaypoints && wpIndex < this.dragWaypoints.length) {
        this.dragWaypoints[wpIndex] = { x: sx, y: sy };
      }

      handle.position.set(sx, sy);
      const r = DOT_RADIUS / viewport.scale.x;
      handle.clear();
      handle.circle(0, 0, r).fill(DOT_COLOR_EMPTY).stroke({ width: 1.5 / viewport.scale.x, color: 0xffffff });
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
      const sx = getState().snapToGrid ? snap(worldPos.x) : worldPos.x;
      const sy = getState().snapToGrid ? snap(worldPos.y) : worldPos.y;

      handle.cursor = "grab";
      this.isDraggingWaypoint = false;
      this.dragWaypointEdgeId = null;
      this.dragWaypoints = null;

      // Check if dragged onto from/to endpoint (merge = remove)
      let shouldRemove = false;
      if (fromPos) {
        const dx = sx - fromPos.x;
        const dy = sy - fromPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < MERGE_DISTANCE / viewport.scale.x) {
          shouldRemove = true;
        }
      }
      if (!shouldRemove && toPos) {
        const dx = sx - toPos.x;
        const dy = sy - toPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < MERGE_DISTANCE / viewport.scale.x) {
          shouldRemove = true;
        }
      }

      const existing = edge.waypoints ? [...edge.waypoints] : [];
      if (shouldRemove) {
        existing.splice(wpIndex, 1);
      } else {
        existing[wpIndex] = { x: sx, y: sy };
      }

      this.callbacks.onEdgeChanged(edge.id, { waypoints: existing.length > 0 ? existing : undefined });
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
      if (!this.isDragging && !this.isDraggingWaypoint) {
        this.fromHandle.visible = false;
        this.toHandle.visible = false;
        this.hideWaypointHandles();
      }
      return;
    }

    const edgeId = selectedEdgeIds[0];
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) {
      this.fromHandle.visible = false;
      this.toHandle.visible = false;
      this.hideWaypointHandles();
      return;
    }

    setEdgeHandleMeta(this.container, { activeEdgeId: edgeId });
    this.currentEdgeId = edgeId;
    this.currentNodeMap = nodeMap;

    const fromPos = resolveEndpoint(edge.from, nodeMap);
    const toPos = resolveEndpoint(edge.to, nodeMap);
    if (!fromPos || !toPos) {
      this.fromHandle.visible = false;
      this.toHandle.visible = false;
      this.hideWaypointHandles();
      return;
    }

    const fromColor = "nodeId" in edge.from ? DOT_COLOR_NODE : DOT_COLOR_EMPTY;
    const toColor = "nodeId" in edge.to ? DOT_COLOR_NODE : DOT_COLOR_EMPTY;
    this.drawDot(this.fromHandle, fromPos.x, fromPos.y, fromColor, viewportScale);
    this.drawDot(this.toHandle, toPos.x, toPos.y, toColor, viewportScale);

    // Draw waypoint handles
    const waypoints = edge.waypoints ?? [];
    if (this.isDraggingWaypoint) {
      // During waypoint drag, don't re-setup handles (they're being managed by the drag)
      return;
    }

    this.ensureWaypointHandles(waypoints.length);
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const handle = this.waypointHandles[i];
      this.drawDot(handle, wp.x, wp.y, DOT_COLOR_EMPTY, viewportScale);
      this.updateWaypointMeta(handle, i);
    }
  }

  private drawDot(handle: Graphics, x: number, y: number, color: number, viewportScale: number): void {
    const r = DOT_RADIUS / viewportScale;

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
