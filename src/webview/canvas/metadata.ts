import type { Container, Graphics } from "pixi.js";
import type { Node } from "../../schema";

export interface NodeMeta {
  fillColor: number | null;
  strokeColor: number | null;
  nodeShape?: Node["shape"];
  nodeDirection?: Node["direction"];
  nodeWidth: number;
  nodeHeight: number;
  hasFileLink: boolean;
  fileLinkPath: string | null;
}

export interface WaypointMeta {
  wpIndex: number;
  lastCtrlClickTime: number;
}

export interface EdgeGroupMeta {
  hasFileLink: boolean;
  fileLinkPath: string | null;
}

export interface EdgeHandleMeta {
  activeEdgeId: string;
}

const nodeMeta = new WeakMap<Container, NodeMeta>();
const nodeRectMeta = new WeakMap<Graphics, NodeMeta>();
const waypointMeta = new WeakMap<Graphics, WaypointMeta>();
const edgeGroupMeta = new WeakMap<Container, EdgeGroupMeta>();
const edgeHandleMeta = new WeakMap<Container, EdgeHandleMeta>();

// Node container metadata (stored on the group Container)
export function getNodeMeta(container: Container): NodeMeta | undefined {
  return nodeMeta.get(container);
}

export function setNodeMeta(container: Container, meta: NodeMeta): void {
  nodeMeta.set(container, meta);
}

// Node rect metadata (stored on the Graphics rect inside a node)
export function getNodeRectMeta(rect: Graphics): NodeMeta | undefined {
  return nodeRectMeta.get(rect);
}

export function setNodeRectMeta(rect: Graphics, meta: NodeMeta): void {
  nodeRectMeta.set(rect, meta);
}

// Waypoint handle metadata
export function getWaypointMeta(handle: Graphics): WaypointMeta | undefined {
  return waypointMeta.get(handle);
}

export function setWaypointMeta(handle: Graphics, meta: WaypointMeta): void {
  waypointMeta.set(handle, meta);
}

// Edge group metadata (stored on the edge Container)
export function getEdgeGroupMeta(container: Container): EdgeGroupMeta | undefined {
  return edgeGroupMeta.get(container);
}

export function setEdgeGroupMeta(container: Container, meta: EdgeGroupMeta): void {
  edgeGroupMeta.set(container, meta);
}

// Edge handle overlay metadata (stored on the overlay Container)
export function getEdgeHandleMeta(container: Container): EdgeHandleMeta | undefined {
  return edgeHandleMeta.get(container);
}

export function setEdgeHandleMeta(container: Container, meta: EdgeHandleMeta): void {
  edgeHandleMeta.set(container, meta);
}
