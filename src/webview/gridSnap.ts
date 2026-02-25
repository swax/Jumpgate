import { getState, setSnapToGrid, subscribe } from "./state";

export const GRID_SIZE = 20;

export function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export function snapBoundBox(oldBox: Box, newBox: Box, stageScale: number): Box {
  if (!getState().snapToGrid) {
    newBox.width = Math.max(10, newBox.width);
    newBox.height = Math.max(10, newBox.height);
    return newBox;
  }

  const gridVisual = GRID_SIZE * stageScale;

  const snappedW = Math.max(gridVisual, Math.round(newBox.width / gridVisual) * gridVisual);
  const snappedH = Math.max(gridVisual, Math.round(newBox.height / gridVisual) * gridVisual);

  const oldRight = oldBox.x + oldBox.width;
  const oldBottom = oldBox.y + oldBox.height;

  // If left/top edge moved, anchor the opposite edge
  if (Math.abs(newBox.x - oldBox.x) > 1 && Math.abs((newBox.x + newBox.width) - oldRight) < 1) {
    newBox.x = oldRight - snappedW;
  }
  if (Math.abs(newBox.y - oldBox.y) > 1 && Math.abs((newBox.y + newBox.height) - oldBottom) < 1) {
    newBox.y = oldBottom - snappedH;
  }

  newBox.width = snappedW;
  newBox.height = snappedH;
  return newBox;
}

const GRID_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="4" y1="4" x2="4" y2="20"/>
  <line x1="12" y1="4" x2="12" y2="20"/>
  <line x1="20" y1="4" x2="20" y2="20"/>
  <line x1="4" y1="4" x2="20" y2="4"/>
  <line x1="4" y1="12" x2="20" y2="12"/>
  <line x1="4" y1="20" x2="20" y2="20"/>
</svg>`;

export function setupGridSnap(btn: HTMLButtonElement): void {
  function updateVisual(): void {
    const { snapToGrid, locked } = getState();
    btn.innerHTML = GRID_SVG;
    btn.style.display = locked ? "none" : "";
    btn.style.opacity = snapToGrid ? "0.9" : "0.4";
    btn.title = snapToGrid ? "Snap to grid (on)" : "Snap to grid (off)";
  }

  btn.addEventListener("click", () => {
    setSnapToGrid(!getState().snapToGrid);
  });

  updateVisual();
  subscribe(updateVisual);
}
