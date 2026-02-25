import type { Node, VscpDocument } from "../schema";

export interface EditorState {
  document: VscpDocument;
  selectedNodeIds: string[];
  locked: boolean;
  snapToGrid: boolean;
}

type Listener = () => void;

let state: EditorState = {
  document: { nodes: [] },
  selectedNodeIds: [],
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
  state = { ...state, selectedNodeIds: ids };
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
    },
    selectedNodeIds: state.selectedNodeIds.filter((id) => !idSet.has(id)),
  };
  notify();
}

export function generateNodeId(): string {
  return crypto.randomUUID();
}

export function setLocked(locked: boolean): void {
  state = { ...state, locked };
  notify();
}

export function setSnapToGrid(snapToGrid: boolean): void {
  state = { ...state, snapToGrid };
  notify();
}

type NodeChanges = Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>;

export function updateNode(id: string, changes: NodeChanges): void {
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes.map((node) =>
        node.id === id ? { ...node, ...changes } : node
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
        return changes ? { ...node, ...changes } : node;
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
