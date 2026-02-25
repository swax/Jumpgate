import { getState, setSnapToGrid, subscribe } from "./state";

export const GRID_SIZE = 20;

export function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
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
