import { Application, Container, FederatedPointerEvent } from "pixi.js";
import type { CursorManager } from "./cursorManager";

const SCALE_BY = 1.1;

export interface PanZoomControls {
  setSuppressGrab: (suppress: boolean) => void;
  resetView: () => void;
}

export function setupPanZoom(
  app: Application,
  viewport: Container,
  cursorManager: CursorManager,
  isLocked?: () => boolean,
  isEdgeMode?: () => boolean
): PanZoomControls {
  let isPanning = false;
  let lastPointer = { x: 0, y: 0 };
  let hoverOnStage = false;
  let suppressGrab = false;
  const cursor = cursorManager;
  const CURSOR_KEY = "pan";

  function updateHoverCursor(): void {
    if (isPanning) return;
    if (hoverOnStage && !suppressGrab) {
      cursor.set(CURSOR_KEY, "grab", 1);
    } else {
      cursor.clear(CURSOR_KEY);
    }
  }

  // Pan: drag on stage background, or from any target when locked/unselected
  // Selected nodes/edges call stopPropagation so their events never reach here.
  app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
    if (e.shiftKey) return;
    if (isEdgeMode?.()) return;
    isPanning = true;
    cursor.set(CURSOR_KEY, "grabbing", 1);
    lastPointer = { x: e.global.x, y: e.global.y };
  });

  app.stage.on("globalpointermove", (e: FederatedPointerEvent) => {
    if (!isPanning) return;
    const dx = e.global.x - lastPointer.x;
    const dy = e.global.y - lastPointer.y;
    viewport.position.x += dx;
    viewport.position.y += dy;
    lastPointer = { x: e.global.x, y: e.global.y };
  });

  const stopPan = () => {
    isPanning = false;
    updateHoverCursor();
  };
  app.stage.on("pointerup", stopPan);
  app.stage.on("pointerupoutside", stopPan);

  app.stage.on("globalpointermove", (e: FederatedPointerEvent) => {
    hoverOnStage = e.target === app.stage;
    if (isPanning) return;
    if (e.shiftKey) {
      cursor.clear(CURSOR_KEY);
      return;
    }
    updateHoverCursor();
  });

  app.stage.on("pointerout", () => {
    hoverOnStage = false;
    if (!isPanning) {
      cursor.clear(CURSOR_KEY);
    }
  });

  // Zoom: mouse wheel to cursor position
  app.canvas.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const oldScale = viewport.scale.x;
    const rect = app.canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const mousePointTo = {
      x: (pointerX - viewport.position.x) / oldScale,
      y: (pointerY - viewport.position.y) / oldScale,
    };
    const direction = e.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(
      0.1,
      Math.min(5, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY)
    );
    viewport.scale.set(newScale);
    viewport.position.set(
      pointerX - mousePointTo.x * newScale,
      pointerY - mousePointTo.y * newScale
    );
  }, { passive: false });

  // Ctrl key suppresses the grab cursor so arrow/pointer cursors show
  window.addEventListener("keydown", (e) => {
    if (e.key === "Control") setSuppressGrab(true);
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "Control") setSuppressGrab(false);
  });

  window.addEventListener("blur", () => {
    setSuppressGrab(false);
  });

  function setSuppressGrab(suppress: boolean): void {
    suppressGrab = suppress;
    updateHoverCursor();
  }

  return {
    setSuppressGrab,
    resetView: () => {
      const defaultZoom = 1 / (SCALE_BY * SCALE_BY);
      viewport.scale.set(defaultZoom);
      viewport.position.set(0, 0);
    },
  };
}
