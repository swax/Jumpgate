import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, TextureSource } from "pixi.js";

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
import { setupThemeToggle } from "./controls/themeToggle";

// VS Code webview API
const vscode = acquireVsCodeApi();

function postMessage(msg: WebviewToExtensionMessage): void {
  vscode.postMessage(msg);
}

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

  const cursorManager = createCursorManager(app.canvas);

  // Viewport container for pan/zoom
  const viewport = new Container();
  app.stage.addChild(viewport);

  // Starfield background layer — pans/zooms with content
  const starfield = new Graphics();
  starfield.zIndex = -1;
  const STAR_COUNT = 400;
  const FIELD_SIZE = 10000;
  for (let i = 0; i < STAR_COUNT; i++) {
    const sx = Math.random() * FIELD_SIZE - FIELD_SIZE / 2;
    const sy = Math.random() * FIELD_SIZE - FIELD_SIZE / 2;
    const sr = 0.3 + Math.random() * 1.5;
    const sa = 0.2 + Math.random() * 0.6;
    starfield.circle(sx, sy, sr).fill({ color: 0xffffff, alpha: sa });
  }
  starfield.visible = false; // shown only for space theme
  viewport.addChild(starfield);
  viewport.sortableChildren = true;

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
  setupThemeToggle(document.getElementById("theme-btn") as HTMLButtonElement, sendEditDebounced);
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

  // Toggle starfield visibility and background based on theme
  const canvasContainer = document.getElementById("canvas-container") as HTMLDivElement;
  subscribe(() => {
    const theme = getState().document.theme;
    if (theme === "space") {
      starfield.visible = true;
      app.renderer.background.color = 0x020408;
      canvasContainer.style.background = "radial-gradient(ellipse at center, #0a0e1a 0%, #020408 100%)";
    } else {
      starfield.visible = false;
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--vscode-editor-background")
        .trim() || "#1e1e1e";
      app.renderer.background.color = bgColor;
      canvasContainer.style.background = bgColor;
    }
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
