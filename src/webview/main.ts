import "pixi.js/unsafe-eval";
import { Application, Container } from "pixi.js";
import type { ExtensionToWebviewMessage } from "../messages";
import type { WebviewToExtensionMessage } from "../messages";
import {
  getState,
  setDocument,
  setSelectedNodeIds,
  toggleSelectedNodeId,
  subscribe,
  updateNode,
  updateNodes,
} from "./state";
import { createRenderer } from "./renderer";
import { setupPanZoom } from "./panZoom";
import { setupLockToggle } from "./lockToggle";
import { setupSidebar } from "./sidebar";
import { setupGridSnap } from "./gridSnap";
import { setupKeyboard } from "./keyboard";

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

  // Viewport container for pan/zoom
  const viewport = new Container();
  app.stage.addChild(viewport);

  // Make app.stage interactive for click-to-deselect
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (e) => {
    if (e.target === app.stage) {
      setSelectedNodeIds([]);
    }
  });

  setupPanZoom(app, viewport);
  setupLockToggle(document.getElementById("lock-btn") as HTMLButtonElement);
  setupGridSnap(document.getElementById("snap-btn") as HTMLButtonElement);
  setupSidebar(document.documentElement, {
    onNodeChanged: (id, changes) => {
      updateNode(id, changes);
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
  });

  subscribe(() => {
    renderer.render(getState());
  });

  setupKeyboard(sendEditDebounced);

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
