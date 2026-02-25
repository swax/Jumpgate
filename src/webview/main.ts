import Konva from "konva";
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
import { setupGridSnap, snapBoundBox } from "./gridSnap";
import { setupKeyboard } from "./keyboard";

// VS Code webview API
const vscode = acquireVsCodeApi();

function postMessage(msg: WebviewToExtensionMessage): void {
  vscode.postMessage(msg);
}

// Set up Konva stage
const container = document.getElementById("canvas-container") as HTMLDivElement;

const stage = new Konva.Stage({
  container,
  width: container.clientWidth,
  height: container.clientHeight,
});

const layer = new Konva.Layer();
stage.add(layer);

const transformer = new Konva.Transformer({
  rotateEnabled: false,
  enabledAnchors: [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ],
  boundBoxFunc: (oldBox, newBox) => snapBoundBox(oldBox, newBox, stage.scaleX()),
});
layer.add(transformer);

// Click on empty stage deselects
stage.on("click tap", (e) => {
  if (e.target === stage) {
    setSelectedNodeIds([]);
  }
});

setupPanZoom(stage);
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
const renderer = createRenderer(stage, layer, transformer, {
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

// Keep stage sized to container
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    stage.width(width);
    stage.height(height);
  }
});
resizeObserver.observe(container);

// Tell extension we're ready
postMessage({ type: "ready" });
