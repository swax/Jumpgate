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
  getNodeById,
  getEdgeById,
} from "./state";
import type { NodeChanges } from "./shared";
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

  // Helper wrappers: update state + send edit in one call
  const nodeChanged = (id: string, changes: NodeChanges) => { updateNode(id, changes); sendEditDebounced(); };
  const nodesChanged = (updates: { id: string; changes: NodeChanges }[]) => { updateNodes(updates); sendEditDebounced(); };
  const edgeChanged = (id: string, changes: Partial<import("../schema").Edge>) => { updateEdge(id, changes); sendEditDebounced(); };

  setupPanZoom(app, viewport, cursorManager);
  setupLockToggle(document.getElementById("lock-btn") as HTMLButtonElement);
  setupGridSnap(document.getElementById("snap-btn") as HTMLButtonElement);
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
      } else {
        setSelectedNodeIds([id]);
      }
    },
    onOpenFileLink: (id, kind) => {
      const fileLink = kind === "edge"
        ? getEdgeById(id)?.fileLink
        : getNodeById(id)?.fileLink;
      if (fileLink) {
        postMessage({ type: "openFileLink", path: fileLink.path, match: fileLink.match });
      }
    },
    onEdgeSelect: (edgeId) => {
      setSelectedEdgeIds([edgeId]);
    },
    onEdgeChanged: edgeChanged,
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
