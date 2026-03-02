import type { WebviewToExtensionMessage } from "../messages";
import type { Edge } from "../schema";
import type { NodeChanges } from "./shared";
import { getState, updateNode, updateNodes, updateEdge } from "./state";

// VS Code webview API
const vscode = acquireVsCodeApi();

export function postMessage(msg: WebviewToExtensionMessage): void {
  vscode.postMessage(msg);
}

// Debounced edit sender
let editTimeout: ReturnType<typeof setTimeout> | null = null;

export function sendEditDebounced(): void {
  if (editTimeout) {
    clearTimeout(editTimeout);
  }
  editTimeout = setTimeout(() => {
    editTimeout = null;
    postMessage({ type: "edit", document: getState().document });
  }, 100);
}

// Helper wrappers: update state + send edit in one call
export const nodeChanged = (id: string, changes: NodeChanges) => { updateNode(id, changes); sendEditDebounced(); };
export const nodesChanged = (updates: { id: string; changes: NodeChanges }[]) => { updateNodes(updates); sendEditDebounced(); };
export const edgeChanged = (id: string, changes: Partial<Omit<Edge, "id">>) => { updateEdge(id, changes); sendEditDebounced(); };
