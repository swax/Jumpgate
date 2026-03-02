import "pixi.js/unsafe-eval";
import { Application, Container, TextureSource } from "pixi.js";

// Enable mipmaps so text stays crisp when the viewport is zoomed out
TextureSource.defaultOptions.autoGenerateMipmaps = true;
import type { ExtensionToWebviewMessage } from "../messages";
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
import { postMessage, sendEditDebounced, nodeChanged, nodesChanged, edgeChanged } from "./messaging";
import { createStarfield, setupThemeBackground } from "./canvas/starfield";

async function main(): Promise<void> {
  const container = document.getElementById("canvas-container") as HTMLDivElement;

  // Set up PixiJS Application
  const app = new Application();
  const defaultBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--vscode-editor-background")
    .trim() || "#1e1e1e";
  await app.init({
    resizeTo: container,
    backgroundAlpha: 1,
    background: defaultBg,
    antialias: true,
  });
  container.appendChild(app.canvas);

  // Prevent browser auto-scroll on middle-click (middle-click opens file links)
  app.canvas.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Suppress default browser context menu (custom menu is wired up after viewport creation)
  app.canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const cursorManager = createCursorManager(app.canvas);

  // Viewport container for pan/zoom
  const viewport = new Container();
  // Default to 2 wheel notches zoomed out (SCALE_BY=1.1 per notch)
  const defaultZoom = 1 / (1.1 * 1.1);
  viewport.scale.set(defaultZoom);
  app.stage.addChild(viewport);

  const starfield = createStarfield(viewport);
  setupThemeBackground(app, starfield, container);
  viewport.sortableChildren = true;

  setupSelectionBox(app, viewport, cursorManager);

  const panZoom = setupPanZoom(app, viewport, cursorManager, () => getState().locked, () => getState().edgeMode);
  setupLockToggle(document.getElementById("lock-btn") as HTMLButtonElement);
  setupGridSnap(document.getElementById("snap-btn") as HTMLButtonElement);
  setupThemeToggle(document.getElementById("theme-btn") as HTMLButtonElement, sendEditDebounced);

  document.getElementById("reset-view-btn")!.addEventListener("click", () => {
    panZoom.resetView();
  });
  setupSidebar(document.documentElement, {
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
        // Locked mode: select node + highlight connected edges
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
        postMessage({ type: "openFileLink", path: fileLink.path, match: fileLink.match, preview });
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
    document.getElementById("edge-btn") as HTMLButtonElement,
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

  // Handle messages from the extension
  window.addEventListener("message", (event) => {
    const msg = event.data as ExtensionToWebviewMessage;
    switch (msg.type) {
      case "update":
        setDocument(msg.document);
        break;
      case "fileLinkResult": {
        if (msg.targetKind === "node") {
          nodeChanged(msg.targetId, { fileLink: msg.fileLink });
        } else {
          edgeChanged(msg.targetId, { fileLink: msg.fileLink });
        }
        break;
      }
    }
  });

  // Tell extension we're ready
  postMessage({ type: "ready" });
}

main();
