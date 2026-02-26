import type { Edge, Node, VscpDocument } from "../schema";
import type { NodeChanges } from "./shared";

let usedNodeIds = new Set<string>();
let usedEdgeIds = new Set<string>();
let nextNodeId = 1;
let nextEdgeId = 1;

function initializeIdTracking(document: VscpDocument): void {
  usedNodeIds = new Set(document.nodes.map((n) => n.id));
  usedEdgeIds = new Set(document.edges.map((e) => e.id));

  let maxNodeId = 0;
  for (const id of usedNodeIds) {
    const stripped = id.startsWith("node-") ? id.slice(5) : id;
    const num = parseInt(stripped, 10);
    if (!isNaN(num) && num > maxNodeId) maxNodeId = num;
  }
  nextNodeId = maxNodeId + 1;

  let maxEdgeId = 0;
  for (const id of usedEdgeIds) {
    const stripped = id.startsWith("edge-") ? id.slice(5) : id;
    const num = parseInt(stripped, 10);
    if (!isNaN(num) && num > maxEdgeId) maxEdgeId = num;
  }
  nextEdgeId = maxEdgeId + 1;
}

export interface EditorState {
  document: VscpDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  edgeMode: boolean;
  locked: boolean;
  snapToGrid: boolean;
}

type Listener = () => void;

let state: EditorState = {
  document: { nodes: [], edges: [] },
  selectedNodeIds: [],
  selectedEdgeIds: [],
  edgeMode: false,
  locked: true,
  snapToGrid: true,
};

const listeners: Set<Listener> = new Set();

export function getState(): EditorState {
  return state;
}

export function setDocument(document: VscpDocument): void {
  initializeIdTracking(document);
  state = { ...state, document };
  notify();
}

export function setSelectedNodeIds(ids: string[]): void {
  state = { ...state, selectedNodeIds: ids, selectedEdgeIds: [] };
  notify();
}

export function setSelectedEdgeIds(ids: string[]): void {
  state = { ...state, selectedEdgeIds: ids, selectedNodeIds: [] };
  notify();
}

export function toggleSelectedNodeId(id: string): void {
  const ids = state.selectedNodeIds;
  const newIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
  state = { ...state, selectedNodeIds: newIds };
  notify();
}

export function addNodes(nodes: Node[]): void {
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: [...state.document.nodes, ...nodes],
    },
  };
  notify();
}

export function deleteNodes(ids: string[]): void {
  const idSet = new Set(ids);
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes
        .filter((n) => !idSet.has(n.id))
        .map((n) => {
          if (n.parentId && idSet.has(n.parentId)) {
            const { parentId, ...rest } = n;
            return rest as Node;
          }
          return n;
        }),
      edges: state.document.edges.filter(
        (e) =>
          !("nodeId" in e.from && idSet.has(e.from.nodeId)) &&
          !("nodeId" in e.to && idSet.has(e.to.nodeId))
      ),
    },
    selectedNodeIds: state.selectedNodeIds.filter((id) => !idSet.has(id)),
  };
  notify();
}

export function generateNodeId(): string {
  while (usedNodeIds.has(`node-${nextNodeId}`)) {
    nextNodeId++;
  }
  const id = `node-${nextNodeId}`;
  usedNodeIds.add(id);
  nextNodeId++;
  return id;
}

export function setEdgeMode(edgeMode: boolean): void {
  state = { ...state, edgeMode };
  notify();
}

export function addEdge(edge: Edge): void {
  state = {
    ...state,
    document: {
      ...state.document,
      edges: [...state.document.edges, edge],
    },
  };
  notify();
}

export function deleteEdges(ids: string[]): void {
  const idSet = new Set(ids);
  state = {
    ...state,
    document: {
      ...state.document,
      edges: state.document.edges.filter((e) => !idSet.has(e.id)),
    },
    selectedEdgeIds: state.selectedEdgeIds.filter((id) => !idSet.has(id)),
  };
  notify();
}

export function updateEdge(id: string, changes: Partial<Omit<Edge, "id">>): void {
  state = {
    ...state,
    document: {
      ...state.document,
      edges: state.document.edges.map((edge) =>
        edge.id === id ? { ...edge, ...changes } : edge
      ),
    },
  };
  notify();
}

export function generateEdgeId(): string {
  while (usedEdgeIds.has(`edge-${nextEdgeId}`)) {
    nextEdgeId++;
  }
  const id = `edge-${nextEdgeId}`;
  usedEdgeIds.add(id);
  nextEdgeId++;
  return id;
}

export function setLocked(locked: boolean): void {
  state = { ...state, locked };
  notify();
}

export function setSnapToGrid(snapToGrid: boolean): void {
  state = { ...state, snapToGrid };
  notify();
}

export function setDocumentTheme(theme: string | undefined): void {
  state = { ...state, document: { ...state.document, theme: theme as any } };
  notify();
}

function applyNodeChanges(node: Node, changes: NodeChanges): Node {
  const { bounds: boundsChanges, parentId, ...rest } = changes;
  const updated: Node = {
    ...node,
    ...rest,
    ...(boundsChanges ? { bounds: { ...node.bounds, ...boundsChanges } } : {}),
  };
  if (parentId === null) {
    delete updated.parentId;
  } else if (parentId !== undefined) {
    updated.parentId = parentId;
  }
  return updated;
}

export function updateNode(id: string, changes: NodeChanges): void {
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes.map((node) =>
        node.id === id ? applyNodeChanges(node, changes) : node
      ),
    },
  };
  notify();
}

export function updateNodes(updates: { id: string; changes: NodeChanges }[]): void {
  const changesById = new Map(updates.map((u) => [u.id, u.changes]));
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes.map((node) => {
        const changes = changesById.get(node.id);
        return changes ? applyNodeChanges(node, changes) : node;
      }),
    },
  };
  notify();
}

// Lazily-computed lookup maps, invalidated on any state mutation
let nodeMap: Map<string, Node> | null = null;
let edgeMap: Map<string, Edge> | null = null;

export function getNodeById(id: string): Node | undefined {
  if (!nodeMap) {
    nodeMap = new Map(state.document.nodes.map((n) => [n.id, n]));
  }
  return nodeMap.get(id);
}

export function getEdgeById(id: string): Edge | undefined {
  if (!edgeMap) {
    edgeMap = new Map(state.document.edges.map((e) => [e.id, e]));
  }
  return edgeMap.get(id);
}

export function getChildNodeIds(parentId: string): string[] {
  return state.document.nodes.filter((n) => n.parentId === parentId).map((n) => n.id);
}

export function getDescendantIds(nodeId: string): string[] {
  const result: string[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const children = getChildNodeIds(id);
    for (const childId of children) {
      result.push(childId);
      stack.push(childId);
    }
  }
  return result;
}

export function getNodeDepth(nodeId: string): number {
  let depth = 0;
  let current = getNodeById(nodeId);
  while (current?.parentId) {
    depth++;
    current = getNodeById(current.parentId);
  }
  return depth;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  nodeMap = null;
  edgeMap = null;
  for (const listener of listeners) {
    listener();
  }
}
