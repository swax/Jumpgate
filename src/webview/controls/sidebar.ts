import { directionValues, type Edge, type Node } from "../../schema";
import { getState, subscribe } from "../state";

const DEFAULT_FILL = "#888888";
const DEFAULT_TEXT = "#cccccc";

export interface SidebarChanges extends Partial<Pick<Node, "nodeColor" | "labelColor" | "shape" | "direction">> {
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
  const textInput = container.querySelector<HTMLInputElement>("#text-color")!;
  const textWrapper = container.querySelector<HTMLElement>("#text-color-wrapper")!;
  const textLabel = container.querySelector<HTMLElement>("#text-color-label")!;
  const shapeSelect = container.querySelector<HTMLSelectElement>("#shape-select")!;
  const rotateBtn = container.querySelector<HTMLButtonElement>("#rotate-btn")!;

  let targetIds: string[] = [];
  let targetType: "node" | "edge" = "node";
  let currentFill = DEFAULT_FILL;
  let currentText = DEFAULT_TEXT;

  function updateTextPreview(): void {
    textWrapper.style.backgroundColor = currentFill;
    textLabel.style.color = currentText;
  }

  function setColors(fill: string, text: string): void {
    currentFill = fill;
    currentText = text;
    fillInput.value = fill;
    textInput.value = text;
    updateTextPreview();
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
    updateTextPreview();
  });

  textInput.addEventListener("input", () => {
    currentText = textInput.value;
    if (targetType === "edge") {
      applyEdgeChanges({ labelColor: currentText });
    } else {
      applyNodeChanges({ labelColor: currentText });
    }
    updateTextPreview();
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
        const node = doc.nodes.find((n) => n.id === id)!;
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
        const node = doc.nodes.find((n) => n.id === id)!;
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

  setColors(DEFAULT_FILL, DEFAULT_TEXT);

  subscribe(() => {
    const { document: doc, selectedNodeIds, selectedEdgeIds, locked } = getState();
    const sidebar = container.querySelector<HTMLElement>("#sidebar")!;
    sidebar.style.display = locked ? "none" : "";

    if (selectedNodeIds.length > 0) {
      const node = doc.nodes.find((n) => n.id === selectedNodeIds[0]);
      if (node) {
        targetIds = selectedNodeIds;
        targetType = "node";
        setColors(node.nodeColor ?? DEFAULT_FILL, node.labelColor ?? DEFAULT_TEXT);
        shapeSelect.value = node.shape ?? "";
        shapeSelect.disabled = false;
        rotateBtn.disabled = false;
      }
    } else if (selectedEdgeIds.length > 0) {
      const edge = doc.edges.find((e) => e.id === selectedEdgeIds[0]);
      if (edge) {
        targetIds = selectedEdgeIds;
        targetType = "edge";
        setColors(edge.color ?? DEFAULT_FILL, edge.labelColor ?? DEFAULT_TEXT);
        shapeSelect.value = "";
        shapeSelect.disabled = true;
        rotateBtn.disabled = true;
      }
    } else {
      targetIds = [];
    }
  });
}
