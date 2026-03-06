import "pixi.js/unsafe-eval";
import { Application, Container, TextureSource } from "pixi.js";

TextureSource.defaultOptions.autoGenerateMipmaps = true;

import {
  getState,
  setDocument,
  setSelectedNodeIds,
  setSelectedEdgeIds,
  setSelection,
  toggleSelectedNodeId,
  getConnectedEdgeIds,
  getConnectedNodeIds,
  subscribe,
  addEdge,
  generateEdgeId,
  getNodeById,
  getEdgeById,
} from "./state";
import { createRenderer } from "./renderer";
import { setupPanZoom } from "./interactions/panZoom";
import { setupLockToggle } from "./controls/lockToggle";
import { setupSidebar } from "./controls/sidebar";
import { setupGridSnap } from "./controls/gridSnap";
import { setupKeyboard } from "./interactions/keyboard";
import { setupContextMenu } from "./interactions/contextMenu";
import { setupEdgeMode } from "./interactions/edgeMode";
import { setupSelectionBox } from "./interactions/selectionBox";
import { createCursorManager } from "./interactions/cursorManager";
import { setupGroupStatus } from "./interactions/groupStatus";
import { setupThemeToggle } from "./controls/themeToggle";
import { setCallbacks, sendEditDebounced, nodeChanged, nodesChanged, edgeChanged } from "./messaging";
import { createStarfield, setupThemeBackground } from "./canvas/starfield";
import { buildEditorDOM } from "./editorDOM";
import type { JgDocument, FileLink } from "./schema";

export type { JgDocument, Node, Edge, FileLink, Bounds, EdgeEndpoint, NodeShape, NodeDirection, DocumentTheme } from "./schema";
export { documentSchema, nodeSchema, edgeSchema } from "./schema";

export interface JumpgateCallbacks {
  /** Called when the document changes (debounced) */
  onDocumentChanged?: (document: JgDocument) => void;
  /** Called when user wants to open a file link */
  onOpenFileLink?: (path: string, match?: string, preview?: boolean) => void;
  /** Called when user wants to edit a file link on a node/edge */
  onEditFileLink?: (targetId: string, targetKind: "node" | "edge", currentPath?: string, currentMatch?: string) => void;
  /** Called when user wants to view the raw source */
  onViewSource?: () => void;
}

export interface JumpgateEditor {
  /** Load or replace the document */
  setDocument(document: JgDocument): void;
  /** Push a file link result back (response to onEditFileLink callback) */
  setFileLink(targetId: string, targetKind: "node" | "edge", fileLink?: FileLink): void;
  /** Clean up and destroy the editor */
  destroy(): void;
}

export async function createJumpgateEditor(
  container: HTMLDivElement,
  callbacks?: JumpgateCallbacks
): Promise<JumpgateEditor> {
  setCallbacks(callbacks ?? {});

  // Build DOM structure inside the container
  const { elements, styleEl } = buildEditorDOM(container);

  // Set up PixiJS Application
  const app = new Application();
  const defaultBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--vscode-editor-background")
    .trim() || "#1e1e1e";
  await app.init({
    resizeTo: elements.canvasContainer,
    backgroundAlpha: 1,
    background: defaultBg,
    antialias: true,
  });
  elements.canvasContainer.appendChild(app.canvas);

  // Prevent browser auto-scroll on middle-click
  app.canvas.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Suppress default browser context menu
  app.canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const cursorManager = createCursorManager(app.canvas);

  // Viewport container for pan/zoom
  const viewport = new Container();
  const defaultZoom = 1 / (1.1 * 1.1);
  viewport.scale.set(defaultZoom);
  app.stage.addChild(viewport);

  const starfield = createStarfield(viewport);
  setupThemeBackground(app, starfield, elements.canvasContainer);
  viewport.sortableChildren = true;

  setupSelectionBox(app, viewport, cursorManager);

  const panZoom = setupPanZoom(app, viewport, cursorManager, () => getState().locked, () => getState().edgeMode);
  setupLockToggle(elements.lockBtn);
  setupGridSnap(elements.snapBtn);
  setupThemeToggle(elements.themeBtn, sendEditDebounced);

  elements.resetViewBtn.addEventListener("click", () => {
    panZoom.resetView();
  });
  setupSidebar(container, {
    onNodeChanged: nodeChanged,
    onNodesChanged: nodesChanged,
    onEdgeChanged: edgeChanged,
  });

  // Create renderer and wire up state subscription
  const renderer = createRenderer(app, viewport, {
    onNodeChanged: nodeChanged,
    onNodesChanged: nodesChanged,
    onSelect: (id, shiftKey) => {
      if (shiftKey) {
        toggleSelectedNodeId(id);
      } else if (getState().locked) {
        setSelection([id], getConnectedEdgeIds(id));
      } else {
        setSelectedNodeIds([id]);
      }
    },
    onOpenFileLink: (id, kind, preview) => {
      const fileLink = kind === "edge"
        ? getEdgeById(id)?.fileLink
        : getNodeById(id)?.fileLink;
      if (fileLink) {
        callbacks?.onOpenFileLink?.(fileLink.path, fileLink.match, preview);
      }
    },
    onEdgeSelect: (edgeId) => {
      if (getState().locked) {
        setSelection(getConnectedNodeIds(edgeId), [edgeId]);
      } else {
        setSelectedEdgeIds([edgeId]);
      }
    },
    onEdgeChanged: edgeChanged,
  });

  subscribe(() => {
    renderer.render(getState());
  });

  setupKeyboard(sendEditDebounced, app, viewport);
  setupContextMenu(app, viewport);

  setupGroupStatus(sendEditDebounced);
  setupEdgeMode(
    elements.edgeBtn,
    viewport,
    app.stage,
    {
      addEdge: (edge) => {
        addEdge(edge);
        sendEditDebounced();
      },
      generateEdgeId,
    }
  );

  return {
    setDocument(document: JgDocument) {
      setDocument(document);
    },
    setFileLink(targetId: string, targetKind: "node" | "edge", fileLink?: FileLink) {
      if (targetKind === "node") {
        nodeChanged(targetId, { fileLink });
      } else {
        edgeChanged(targetId, { fileLink });
      }
    },
    destroy() {
      app.destroy(true);
      styleEl.remove();
      container.innerHTML = "";
    },
  };
}

