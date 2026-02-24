import type { Node, VscpDocument } from "../schema";

export interface EditorState {
  document: VscpDocument;
  selectedNodeId: string | null;
  locked: boolean;
}

type Listener = () => void;

let state: EditorState = {
  document: { nodes: [] },
  selectedNodeId: null,
  locked: false,
};

const listeners: Set<Listener> = new Set();

export function getState(): EditorState {
  return state;
}

export function setDocument(document: VscpDocument): void {
  state = { ...state, document };
  notify();
}

export function setSelectedNodeId(id: string | null): void {
  state = { ...state, selectedNodeId: id };
  notify();
}

export function setLocked(locked: boolean): void {
  state = { ...state, locked };
  notify();
}

export function updateNode(
  id: string,
  changes: Partial<Pick<Node, "x" | "y" | "width" | "height" | "nodeColor" | "labelColor" | "label">>
): void {
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

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
