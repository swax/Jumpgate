import { Application, Container, FederatedPointerEvent } from "pixi.js";

const SCALE_BY = 1.2;

export function setupPanZoom(app: Application, viewport: Container): void {
  let isPanning = false;
  let lastPointer = { x: 0, y: 0 };

  // Pan: drag on empty stage background
  app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
    if (e.target !== app.stage) return;
    isPanning = true;
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
  };
  app.stage.on("pointerup", stopPan);
  app.stage.on("pointerupoutside", stopPan);

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
}
