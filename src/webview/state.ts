import type { Edge, Node, VscpDocument } from "../schema";

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
  locked: false,
  snapToGrid: true,
};

const listeners: Set<Listener> = new Set();

export function getState(): EditorState {
  return state;
}

export function setDocument(document: VscpDocument): void {
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
      nodes: state.document.nodes.filter((n) => !idSet.has(n.id)),
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
  return crypto.randomUUID();
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
  return `edge-${crypto.randomUUID()}`;
}

export function setLocked(locked: boolean): void {
  state = { ...state, locked };
  notify();
}

export function setSnapToGrid(snapToGrid: boolean): void {
  state = { ...state, snapToGrid };
  notify();
}

type NodeChanges = {
  bounds?: Partial<Node["bounds"]>;
  nodeColor?: string;
  labelColor?: string;
  label?: string;
};

function applyNodeChanges(node: Node, changes: NodeChanges): Node {
  const { bounds: boundsChanges, ...rest } = changes;
  return {
    ...node,
    ...rest,
    ...(boundsChanges ? { bounds: { ...node.bounds, ...boundsChanges } } : {}),
  };
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

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
