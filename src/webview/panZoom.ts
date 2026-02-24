import Konva from "konva";

const SCALE_BY = 1.2;

export function setupPanZoom(stage: Konva.Stage): void {
  // Pan: drag on empty stage background
  stage.draggable(true);

  // Zoom: mouse wheel to cursor position
  stage.on("wheel", (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(
      0.1,
      Math.min(5, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY)
    );
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  });
}
