import "pixi.js/unsafe-eval";
import { Application, Container, TextureSource } from "pixi.js";

// Enable mipmaps so text stays crisp when the viewport is zoomed out
TextureSource.defaultOptions.autoGenerateMipmaps = true;
import type { ExtensionToWebviewMessage } from "../messages";
import type { WebviewToExtensionMessage } from "../messages";
import {
  getState,
  setDocument,
  setSelectedNodeIds,
  setSelectedEdgeIds,
  toggleSelectedNodeId,
  subscribe,
  updateNode,
  updateNodes,
  addEdge,
  updateEdge,
  generateEdgeId,
} from "./state";
import { createRenderer } from "./renderer";
import { setupPanZoom } from "./interactions/panZoom";
import { setupLockToggle } from "./controls/lockToggle";
import { setupSidebar } from "./controls/sidebar";
import { setupGridSnap } from "./controls/gridSnap";
import { setupKeyboard } from "./interactions/keyboard";
import { setupEdgeMode } from "./interactions/edgeMode";
import { setupSelectionBox } from "./interactions/selectionBox";
import { createCursorManager } from "./interactions/cursorManager";
import { setupGroupStatus } from "./interactions/groupStatus";

// VS Code webview API
const vscode = acquireVsCodeApi();

function postMessage(msg: WebviewToExtensionMessage): void {
  vscode.postMessage(msg);
}

async function main(): Promise<void> {
  const container = document.getElementById("canvas-container") as HTMLDivElement;

  // Set up PixiJS Application
  const app = new Application();
  await app.init({
    resizeTo: container,
    backgroundAlpha: 0,
    antialias: true,
  });
  container.appendChild(app.canvas);

  const cursorManager = createCursorManager(app.canvas);

  // Viewport container for pan/zoom
  const viewport = new Container();
  app.stage.addChild(viewport);

  setupSelectionBox(app, viewport, cursorManager);

  setupPanZoom(app, viewport, cursorManager);
  setupLockToggle(document.getElementById("lock-btn") as HTMLButtonElement);
  setupGridSnap(document.getElementById("snap-btn") as HTMLButtonElement);
  setupSidebar(document.documentElement, {
    onNodeChanged: (id, changes) => {
      updateNode(id, changes);
      sendEditDebounced();
    },
    onNodesChanged: (updates) => {
      updateNodes(updates);
      sendEditDebounced();
    },
    onEdgeChanged: (id, changes) => {
      updateEdge(id, changes);
      sendEditDebounced();
    },
  });

  // Debounced edit sender
  let editTimeout: ReturnType<typeof setTimeout> | null = null;

  function sendEditDebounced(): void {
    if (editTimeout) {
      clearTimeout(editTimeout);
    }
    editTimeout = setTimeout(() => {
      editTimeout = null;
      postMessage({ type: "edit", document: getState().document });
    }, 100);
  }

  // Create renderer and wire up state subscription
  const renderer = createRenderer(app, viewport, {
    onNodeChanged: (id, changes) => {
      updateNode(id, changes);
      sendEditDebounced();
    },
    onNodesChanged: (updates) => {
      updateNodes(updates);
      sendEditDebounced();
    },
    onSelect: (id, shiftKey) => {
      if (shiftKey) {
        toggleSelectedNodeId(id);
      } else {
        setSelectedNodeIds([id]);
      }
    },
    onOpenFileLink: (id, kind) => {
      const doc = getState().document;
      const fileLink = kind === "edge"
        ? doc.edges.find((e) => e.id === id)?.fileLink
        : doc.nodes.find((n) => n.id === id)?.fileLink;
      if (fileLink) {
        postMessage({ type: "openFileLink", path: fileLink.path, match: fileLink.match });
      }
    },
    onEdgeSelect: (edgeId) => {
      setSelectedEdgeIds([edgeId]);
    },
    onEdgeChanged: (id, changes) => {
      updateEdge(id, changes);
      sendEditDebounced();
    },
  });


  subscribe(() => {
    renderer.render(getState());
  });

  setupKeyboard(sendEditDebounced);
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
    }
  });

  // Tell extension we're ready
  postMessage({ type: "ready" });
}

main();
