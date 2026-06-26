import type { DocumentTheme, Edge, Node, JgDocument } from "./schema";
import type { NodeChanges } from "./shared";

let usedNodeIds = new Set<string>();
let usedEdgeIds = new Set<string>();
let nextNodeId = 1;
let nextEdgeId = 1;

function initializeIdTracking(document: JgDocument): void {
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
  document: JgDocument;
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

// ── Undo / redo history ────────────────────────────────────────────
// Snapshots of `document` taken just before each mutation. A single user gesture frequently
// fans out into several synchronous mutations (a resize also rescales connected-edge anchors;
// deleting a selection removes nodes then edges). We capture only the first mutation's pre-state
// per microtask, so the whole synchronous cascade collapses into one undo step. Separate user
// gestures arrive on separate DOM events (separate macrotasks), so they never coalesce.
const MAX_HISTORY = 100;
let undoStack: JgDocument[] = [];
let redoStack: JgDocument[] = [];
let historyCaptured = false;

function cloneDocument(document: JgDocument): JgDocument {
  return structuredClone(document);
}

/** Capture the current document as a restore point. Called at the start of every mutation;
 *  coalesces same-tick cascades into a single entry. */
export function recordHistory(): void {
  if (historyCaptured) return;
  historyCaptured = true;
  queueMicrotask(() => {
    historyCaptured = false;
  });
  undoStack.push(cloneDocument(state.document));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

/** Restore a previous document snapshot (undo/redo) without recording new history. Keeps the
 *  id counters monotonic so a redo can't hand out an id that collides with a restored node. */
function applyRestoredDocument(document: JgDocument): void {
  for (const n of document.nodes) usedNodeIds.add(n.id);
  for (const e of document.edges) usedEdgeIds.add(e.id);
  const nodeIds = new Set(document.nodes.map((n) => n.id));
  const edgeIds = new Set(document.edges.map((e) => e.id));
  state = {
    ...state,
    document,
    selectedNodeIds: state.selectedNodeIds.filter((id) => nodeIds.has(id)),
    selectedEdgeIds: state.selectedEdgeIds.filter((id) => edgeIds.has(id)),
  };
  notify();
}

export function undo(): boolean {
  const previous = undoStack.pop();
  if (!previous) return false;
  redoStack.push(cloneDocument(state.document));
  applyRestoredDocument(previous);
  return true;
}

export function redo(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(cloneDocument(state.document));
  applyRestoredDocument(next);
  return true;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** Discard all history — call when a brand-new document is loaded. */
export function resetHistory(): void {
  undoStack = [];
  redoStack = [];
  historyCaptured = false;
}

export function getState(): EditorState {
  return state;
}

export function setDocument(document: JgDocument): void {
  initializeIdTracking(document);
  resetHistory();
  state = { ...state, document };
  notify();
}

export function setSelectedNodeIds(ids: string[]): void {
  state = { ...state, selectedNodeIds: ids, selectedEdgeIds: [] };
  notify();
}

export function setSelection(nodeIds: string[], edgeIds: string[]): void {
  state = { ...state, selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds };
  notify();
}

export function getConnectedEdgeIds(nodeId: string): string[] {
  return state.document.edges
    .filter(
      (e) =>
        ("nodeId" in e.from && e.from.nodeId === nodeId) ||
        ("nodeId" in e.to && e.to.nodeId === nodeId),
    )
    .map((e) => e.id);
}

export function getConnectedNodeIds(edgeId: string): string[] {
  const edge = state.document.edges.find((e) => e.id === edgeId);
  if (!edge) return [];
  const ids: string[] = [];
  if ("nodeId" in edge.from) ids.push(edge.from.nodeId);
  if ("nodeId" in edge.to) ids.push(edge.to.nodeId);
  return ids;
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
  recordHistory();
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
  recordHistory();
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
          !("nodeId" in e.to && idSet.has(e.to.nodeId)),
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
  recordHistory();
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
  recordHistory();
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
  recordHistory();
  state = {
    ...state,
    document: {
      ...state.document,
      edges: state.document.edges.map((edge) => (edge.id === id ? { ...edge, ...changes } : edge)),
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
  recordHistory();
  state = {
    ...state,
    document: { ...state.document, theme: theme as DocumentTheme | undefined },
  };
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
  recordHistory();
  state = {
    ...state,
    document: {
      ...state.document,
      nodes: state.document.nodes.map((node) =>
        node.id === id ? applyNodeChanges(node, changes) : node,
      ),
    },
  };
  notify();
}

export function updateNodes(updates: { id: string; changes: NodeChanges }[]): void {
  recordHistory();
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

export function resetState(): void {
  usedNodeIds = new Set<string>();
  usedEdgeIds = new Set<string>();
  nextNodeId = 1;
  nextEdgeId = 1;
  state = {
    document: { nodes: [], edges: [] },
    selectedNodeIds: [],
    selectedEdgeIds: [],
    edgeMode: false,
    locked: true,
    snapToGrid: true,
  };
  nodeMap = null;
  edgeMap = null;
  listeners.clear();
  resetHistory();
}
