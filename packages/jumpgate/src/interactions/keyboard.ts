import type { Container, Application } from "pixi.js";
import { getState, undo, redo } from "../state";
import {
  copySelectedNodes,
  cutSelectedNodes,
  pasteNodes,
  deleteSelected,
  setLastMouseWorldPos,
} from "./clipboard";

export function setupKeyboard(onEdit: () => void, app: Application, viewport: Container): void {
  // Track mouse position in world coordinates for paste-at-cursor
  app.stage.addEventListener("pointermove", (e) => {
    const worldPos = viewport.toLocal(e.global);
    setLastMouseWorldPos(worldPos.x, worldPos.y);
  });

  window.addEventListener("keydown", (e) => {
    const state = getState();
    if (state.locked) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Undo / redo. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes.
    // `key` is normalized to lowercase because Shift makes it "Z".
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (undo()) onEdit();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        if (redo()) onEdit();
        return;
      }
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelected(onEdit);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      copySelectedNodes();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "x") {
      cutSelectedNodes(onEdit);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      pasteNodes(onEdit);
      return;
    }
  });
}
