import { getState, setDocumentTheme, subscribe } from "../state";

// Planet icon — shown when current theme is standard (click to switch to space)
const SPACE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="8" cy="14" r="1.5"/><circle cx="14" cy="9" r="2"/><circle cx="16" cy="14" r="1"/></svg>`;

// Square icon — shown when current theme is space (click to switch to standard)
const STANDARD_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/></svg>`;

export function setupThemeToggle(
  button: HTMLButtonElement,
  onChanged: () => void
): void {
  function updateVisual(): void {
    const theme = getState().document.theme;
    if (theme === "space") {
      button.innerHTML = STANDARD_SVG;
      button.title = "Theme: Space (click for Standard)";
    } else {
      button.innerHTML = SPACE_SVG;
      button.title = "Theme: Standard (click for Space)";
    }
  }

  button.addEventListener("click", () => {
    const current = getState().document.theme;
    const next = current === "space" ? undefined : "space";
    setDocumentTheme(next);
    onChanged();
  });

  updateVisual();
  subscribe(updateVisual);
}
