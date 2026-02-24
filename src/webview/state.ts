import type { Box, VscpDocument } from "../schema";

export interface EditorState {
  document: VscpDocument;
  selectedBoxId: string | null;
}

type Listener = () => void;

let state: EditorState = {
  document: { boxes: [] },
  selectedBoxId: null,
};

const listeners: Set<Listener> = new Set();

export function getState(): EditorState {
  return state;
}

export function setDocument(document: VscpDocument): void {
  state = { ...state, document };
  notify();
}

export function setSelectedBoxId(id: string | null): void {
  state = { ...state, selectedBoxId: id };
  notify();
}

export function updateBox(
  id: string,
  changes: Partial<Pick<Box, "x" | "y" | "width" | "height">>
): void {
  state = {
    ...state,
    document: {
      ...state.document,
      boxes: state.document.boxes.map((box) =>
        box.id === id ? { ...box, ...changes } : box
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
