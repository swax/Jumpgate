import { getState, setLocked, setSelectedNodeIds } from "../state";

// Shown when locked — click to edit
const PENCIL_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
// Shown when unlocked — click to lock
const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg>`;

export function setupLockToggle(button: HTMLButtonElement): void {
  button.innerHTML = PENCIL_SVG;
  button.title = "Edit";
  button.addEventListener("click", () => {
    const newLocked = !getState().locked;
    setLocked(newLocked);
    if (newLocked) {
      setSelectedNodeIds([]);
    }
    button.innerHTML = newLocked ? PENCIL_SVG : LOCK_SVG;
    button.title = newLocked ? "Edit" : "Lock";
  });
}
