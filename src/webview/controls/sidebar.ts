import { directionValues, type Edge, type Node } from "../../schema";
import { getState, subscribe, getNodeById, getEdgeById } from "../state";

const DEFAULT_FILL = "#888888";
const DEFAULT_TEXT = "#cccccc";

const STANDARD_SHAPE_OPTIONS: [string, string][] = [
  ["", "▭"],
  ["rounded-rectangle", "▢"],
  ["ellipse", "⬭"],
  ["diamond", "◇"],
  ["parallelogram", "▱"],
  ["trapezoid", "⏢"],
  ["triangle", "△"],
  ["cylinder", "⌭"],
  ["pill", "⊖"],
  ["half-ellipse", "⌓"],
  ["half-pill", "◗"],
  ["document", "⎵"],
  ["text", "T"],
];

const SPACE_SHAPE_OPTIONS: [string, string][] = [
  ["", "✦"],
  ["rounded-rectangle", "✶"],
  ["ellipse", "●"],
  ["diamond", "✸"],
  ["parallelogram", "☄"],
  ["trapezoid", "⬣"],
  ["triangle", "▲"],
  ["cylinder", "◎"],
  ["pill", "☁"],
  ["half-ellipse", "☾"],
  ["half-pill", "◈"],
  ["document", "☷"],
  ["text", "T"],
];

export interface SidebarChanges extends Partial<Pick<Node, "nodeColor" | "labelColor" | "borderColor" | "shape" | "direction">> {
  bounds?: Partial<Node["bounds"]>;
}

export type EdgeSidebarChanges = Partial<Pick<Edge, "color" | "labelColor">>;

export interface SidebarCallbacks {
  onNodeChanged: (
    id: string,
    changes: SidebarChanges
  ) => void;
  onNodesChanged?: (
    updates: {
      id: string;
      changes: SidebarChanges;
    }[]
  ) => void;
  onEdgeChanged: (
    id: string,
    changes: EdgeSidebarChanges
  ) => void;
}

export function setupSidebar(
  container: HTMLElement,
  callbacks: SidebarCallbacks
): void {
  const fillInput = container.querySelector<HTMLInputElement>("#fill-color")!;
  const fillWrapper = container.querySelector<HTMLElement>("#fill-color-wrapper")!;
  const fillClear = fillWrapper.querySelector<HTMLElement>(".color-clear")!;
  const textInput = container.querySelector<HTMLInputElement>("#text-color")!;
  const textWrapper = container.querySelector<HTMLElement>("#text-color-wrapper")!;
  const textLabel = container.querySelector<HTMLElement>("#text-color-label")!;
  const borderInput = container.querySelector<HTMLInputElement>("#border-color")!;
  const borderWrapper = container.querySelector<HTMLElement>("#border-color-wrapper")!;
  const borderClear = borderWrapper.querySelector<HTMLElement>(".color-clear")!;
  const shapeSelect = container.querySelector<HTMLSelectElement>("#shape-select")!;
  const rotateBtn = container.querySelector<HTMLButtonElement>("#rotate-btn")!;

  const themeBtn = container.querySelector<HTMLButtonElement>("#theme-btn");

  let targetIds: string[] = [];
  let targetType: "node" | "edge" = "node";
  let currentFill: string | null = null;
  let currentText = DEFAULT_TEXT;
  let currentBorder: string | null = null;
  let currentShapeTheme: string | undefined;

  function rebuildShapeOptions(theme: string | undefined): void {
    if (theme === currentShapeTheme) return;
    currentShapeTheme = theme;
    const savedValue = shapeSelect.value;
    shapeSelect.innerHTML = "";
    const options = theme === "space" ? SPACE_SHAPE_OPTIONS : STANDARD_SHAPE_OPTIONS;
    for (const [value, label] of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      shapeSelect.appendChild(opt);
    }
    shapeSelect.value = savedValue;
  }

  function updatePreview(): void {
    textWrapper.style.backgroundColor = currentFill ?? "transparent";
    textLabel.style.color = currentText;
    borderWrapper.style.backgroundColor = currentFill ?? "transparent";
    borderWrapper.style.borderColor = currentBorder ?? "transparent";
    fillWrapper.classList.toggle("is-none", currentFill === null);
    borderWrapper.classList.toggle("is-none", currentBorder === null);
  }

  function setColors(fill: string | null, text: string, border: string | null): void {
    currentFill = fill;
    currentText = text;
    currentBorder = border;
    fillInput.value = fill ?? DEFAULT_FILL;
    textInput.value = text;
    borderInput.value = border ?? "#333333";
    updatePreview();
  }

  function applyNodeChanges(changes: SidebarChanges): void {
    if (targetIds.length === 0) return;
    if (callbacks.onNodesChanged) {
      callbacks.onNodesChanged(
        targetIds.map((id) => ({
          id,
          changes,
        }))
      );
      return;
    }
    for (const id of targetIds) {
      callbacks.onNodeChanged(id, changes);
    }
  }

  function applyEdgeChanges(changes: EdgeSidebarChanges): void {
    for (const id of targetIds) {
      callbacks.onEdgeChanged(id, changes);
    }
  }

  fillInput.addEventListener("input", () => {
    currentFill = fillInput.value;
    if (targetType === "edge") {
      applyEdgeChanges({ color: currentFill });
    } else {
      applyNodeChanges({ nodeColor: currentFill });
    }
    updatePreview();
  });

  fillClear.addEventListener("click", (e) => {
    e.stopPropagation();
    currentFill = null;
    if (targetType === "edge") {
      applyEdgeChanges({ color: undefined });
    } else {
      applyNodeChanges({ nodeColor: undefined });
    }
    updatePreview();
  });

  borderInput.addEventListener("input", () => {
    currentBorder = borderInput.value;
    applyNodeChanges({ borderColor: currentBorder });
    updatePreview();
  });

  borderClear.addEventListener("click", (e) => {
    e.stopPropagation();
    currentBorder = null;
    applyNodeChanges({ borderColor: undefined });
    updatePreview();
  });

  textInput.addEventListener("input", () => {
    currentText = textInput.value;
    if (targetType === "edge") {
      applyEdgeChanges({ labelColor: currentText });
    } else {
      applyNodeChanges({ labelColor: currentText });
    }
    updatePreview();
  });

  shapeSelect.addEventListener("change", () => {
    const value = shapeSelect.value;
    applyNodeChanges({ shape: (value || undefined) as Node["shape"] });
  });

  rotateBtn.addEventListener("click", () => {
    if (targetIds.length === 0) return;
    const { document: doc } = getState();
    if (callbacks.onNodesChanged) {
      const updates = targetIds.map((id) => {
        const node = getNodeById(id)!;
        const curIdx = directionValues.indexOf(node.direction ?? "up");
        const newDirection = directionValues[(curIdx + 1) % directionValues.length];
        const { x, y, width, height } = node.bounds;
        return {
          id,
          changes: {
            direction: newDirection === "up" ? undefined : newDirection,
            bounds: {
              x: x + (width - height) / 2,
              y: y + (height - width) / 2,
              width: height,
              height: width,
            },
          } as SidebarChanges,
        };
      });
      callbacks.onNodesChanged(updates);
    } else {
      for (const id of targetIds) {
        const node = getNodeById(id)!;
        const curIdx = directionValues.indexOf(node.direction ?? "up");
        const newDirection = directionValues[(curIdx + 1) % directionValues.length];
        const { x, y, width, height } = node.bounds;
        callbacks.onNodeChanged(id, {
          direction: newDirection === "up" ? undefined : newDirection,
          bounds: {
            x: x + (width - height) / 2,
            y: y + (height - width) / 2,
            width: height,
            height: width,
          },
        });
      }
    }
  });

  setColors(null, DEFAULT_TEXT, null);

  subscribe(() => {
    const { document: doc, selectedNodeIds, selectedEdgeIds, locked } = getState();
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = locked ? "none" : "";
    if (themeBtn) themeBtn.style.display = locked ? "none" : "";
    rebuildShapeOptions(doc.theme);

    if (selectedNodeIds.length > 0) {
      const node = getNodeById(selectedNodeIds[0]);
      if (node) {
        targetIds = selectedNodeIds;
        targetType = "node";
        setColors(node.nodeColor ?? null, node.labelColor ?? DEFAULT_TEXT, node.borderColor ?? null);
        shapeSelect.value = node.shape ?? "";
        shapeSelect.disabled = false;
        rotateBtn.disabled = false;
        borderWrapper.style.display = "";
      }
    } else if (selectedEdgeIds.length > 0) {
      const edge = getEdgeById(selectedEdgeIds[0]);
      if (edge) {
        targetIds = selectedEdgeIds;
        targetType = "edge";
        setColors(edge.color ?? null, edge.labelColor ?? DEFAULT_TEXT, null);
        shapeSelect.value = "";
        shapeSelect.disabled = true;
        rotateBtn.disabled = true;
        borderWrapper.style.display = "none";
      }
    }
  });
}
