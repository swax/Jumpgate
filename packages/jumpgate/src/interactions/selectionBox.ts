import { Application, Container, Graphics, FederatedPointerEvent } from "pixi.js";
import { DRAG_THRESHOLD } from "../shared";
import { getState, setSelectedEdgeIds, setSelectedNodeIds } from "../state";
import { getContainerBounds } from "../canvas/canvasNode";
import type { CursorManager } from "./cursorManager";

const SELECTION_COLOR = 0x3399ff;
const SELECTION_ALPHA = 0.15;
const SELECTION_STROKE_ALPHA = 0.8;

export function setupSelectionBox(
  app: Application,
  viewport: Container,
  cursorManager: CursorManager,
): void {
  const selectionRect = new Graphics();
  selectionRect.label = "__selection_rect__";
  selectionRect.eventMode = "none";
  selectionRect.visible = false;

  const selectionOverlay = viewport.getChildByLabel("__selection_overlay__");
  if (selectionOverlay) {
    const overlayIndex = viewport.getChildIndex(selectionOverlay);
    viewport.addChildAt(selectionRect, overlayIndex);
  } else {
    viewport.addChild(selectionRect);
  }

  let selectionStart: { x: number; y: number } | null = null;
  let isSelecting = false;
  const cursor = cursorManager;
  const CURSOR_KEY = "select";
  let hoverOnStage = false;

  function clearSelectionRect(): void {
    selectionRect.clear();
    selectionRect.visible = false;
  }

  function drawSelectionRect(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(start.x - end.x);
    const h = Math.abs(start.y - end.y);
    const lineWidth = 1 / viewport.scale.x;
    selectionRect
      .clear()
      .rect(x, y, w, h)
      .fill({ color: SELECTION_COLOR, alpha: SELECTION_ALPHA })
      .stroke({
        width: lineWidth,
        color: SELECTION_COLOR,
        alpha: SELECTION_STROKE_ALPHA,
      });
    selectionRect.visible = true;
  }

  // Make app.stage interactive for click-to-deselect and selection box
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
    const state = getState();
    if (state.edgeMode) return;
    if (e.target !== app.stage) return;

    if (!e.shiftKey) {
      if (state.locked) {
        // In locked mode, defer deselect until pointerup without drag (so panning preserves selection)
        const downPos = { x: e.global.x, y: e.global.y };
        const onUpDeselect = (ue: FederatedPointerEvent) => {
          app.stage.off("pointerup", onUpDeselect);
          app.stage.off("pointerupoutside", onUpDeselect);
          const dx = ue.global.x - downPos.x;
          const dy = ue.global.y - downPos.y;
          if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
            setSelectedNodeIds([]);
            setSelectedEdgeIds([]);
          }
        };
        app.stage.on("pointerup", onUpDeselect);
        app.stage.on("pointerupoutside", onUpDeselect);
        return;
      }
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      return;
    }

    if (state.locked) return;

    const local = viewport.toLocal(e.global);
    selectionStart = { x: local.x, y: local.y };
    isSelecting = true;

    const onMove = (me: FederatedPointerEvent) => {
      if (!isSelecting || !selectionStart) return;
      const current = viewport.toLocal(me.global);
      const dx = current.x - selectionStart.x;
      const dy = current.y - selectionStart.y;
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
        clearSelectionRect();
        return;
      }
      drawSelectionRect(selectionStart, current);
    };

    const onUp = (ue: FederatedPointerEvent) => {
      app.stage.off("globalpointermove", onMove);
      app.stage.off("pointerup", onUp);
      app.stage.off("pointerupoutside", onUp);

      if (!selectionStart) {
        isSelecting = false;
        return;
      }

      const end = viewport.toLocal(ue.global);
      const minX = Math.min(selectionStart.x, end.x);
      const minY = Math.min(selectionStart.y, end.y);
      const maxX = Math.max(selectionStart.x, end.x);
      const maxY = Math.max(selectionStart.y, end.y);
      const w = maxX - minX;
      const h = maxY - minY;

      clearSelectionRect();

      if (w >= DRAG_THRESHOLD && h >= DRAG_THRESHOLD) {
        const { document: doc } = getState();
        const selectedIds: string[] = [];
        for (const node of doc.nodes) {
          const container = viewport.getChildByLabel(node.id) as Container | null;
          const bounds = container ? getContainerBounds(container) : node.bounds;
          const overlaps =
            bounds.x < maxX &&
            bounds.x + bounds.width > minX &&
            bounds.y < maxY &&
            bounds.y + bounds.height > minY;
          if (overlaps) {
            selectedIds.push(node.id);
          }
        }

        const current = getState().selectedNodeIds;
        const merged = new Set<string>(current);
        for (const id of selectedIds) merged.add(id);
        setSelectedNodeIds([...merged]);
      }

      selectionStart = null;
      isSelecting = false;
      cursor.clear(CURSOR_KEY);
    };

    app.stage.on("globalpointermove", onMove);
    app.stage.on("pointerup", onUp);
    app.stage.on("pointerupoutside", onUp);
  });

  function updateHoverCursor(shiftKey: boolean): void {
    const state = getState();
    if (state.edgeMode || state.locked) return;

    if (isSelecting) {
      cursor.set(CURSOR_KEY, "crosshair", 2);
      return;
    }

    if (shiftKey && hoverOnStage) {
      cursor.set(CURSOR_KEY, "crosshair", 2);
    } else {
      cursor.clear(CURSOR_KEY);
    }
  }

  app.stage.on("globalpointermove", (e: FederatedPointerEvent) => {
    const state = getState();
    if (state.edgeMode || state.locked) return;

    if (isSelecting) {
      cursor.set(CURSOR_KEY, "crosshair", 2);
      return;
    }

    hoverOnStage = e.target === app.stage;
    updateHoverCursor(e.shiftKey);
  });

  app.stage.on("pointerout", () => {
    hoverOnStage = false;
    cursor.clear(CURSOR_KEY);
  });

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Shift") {
      updateHoverCursor(true);
    }
  });

  window.addEventListener("keyup", (e: KeyboardEvent) => {
    if (e.key === "Shift") {
      updateHoverCursor(false);
    }
  });
}
