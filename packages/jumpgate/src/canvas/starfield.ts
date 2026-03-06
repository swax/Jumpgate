import { Application, Container, Graphics } from "pixi.js";
import { subscribe, getState } from "../state";

const STAR_COUNT = 400;
const FIELD_SIZE = 10000;

export function createStarfield(viewport: Container): Graphics {
  const starfield = new Graphics();
  starfield.zIndex = -1;
  for (let i = 0; i < STAR_COUNT; i++) {
    const sx = Math.random() * FIELD_SIZE - FIELD_SIZE / 2;
    const sy = Math.random() * FIELD_SIZE - FIELD_SIZE / 2;
    const sr = 0.3 + Math.random() * 1.5;
    const sa = 0.2 + Math.random() * 0.6;
    starfield.circle(sx, sy, sr).fill({ color: 0xffffff, alpha: sa });
  }
  starfield.visible = false; // shown only for space theme
  viewport.addChild(starfield);
  return starfield;
}

export function setupThemeBackground(
  app: Application,
  starfield: Graphics,
  canvasContainer: HTMLDivElement
): void {
  subscribe(() => {
    const theme = getState().document.theme;
    if (theme === "space") {
      starfield.visible = true;
      app.renderer.background.color = 0x020408;
      canvasContainer.style.background = "radial-gradient(ellipse at center, #0a0e1a 0%, #020408 100%)";
    } else {
      starfield.visible = false;
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--vscode-editor-background")
        .trim() || "#1e1e1e";
      app.renderer.background.color = bgColor;
      canvasContainer.style.background = bgColor;
    }
  });
}
