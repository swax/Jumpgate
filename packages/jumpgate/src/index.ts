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

interface EditorElements {
  canvasContainer: HTMLDivElement;
  lockBtn: HTMLButtonElement;
  resetViewBtn: HTMLButtonElement;
  snapBtn: HTMLButtonElement;
  edgeBtn: HTMLButtonElement;
  themeBtn: HTMLButtonElement;
}

function buildEditorDOM(container: HTMLDivElement): { elements: EditorElements; styleEl: HTMLStyleElement } {
  container.innerHTML = "";

  const styleEl = document.createElement("style");
  styleEl.textContent = EDITOR_CSS;
  document.head.appendChild(styleEl);

  container.classList.add("jumpgate-editor");

  const canvasContainer = document.createElement("div");
  canvasContainer.id = "canvas-container";
  container.appendChild(canvasContainer);

  const themeBtn = createToolbarButton("theme-btn", "Theme: Standard");
  container.appendChild(themeBtn);

  const edgeBtn = createToolbarButton("edge-btn", "Add Edge");
  container.appendChild(edgeBtn);

  const snapBtn = createToolbarButton("snap-btn", "Snap to grid (on)");
  container.appendChild(snapBtn);

  const resetViewBtn = createToolbarButton("reset-view-btn", "Reset view");
  resetViewBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 3h5v2H5v3H3V3zM16 3h5v5h-2V5h-3V3zM3 16v5h5v-2H5v-3H3zM19 19v-3h2v5h-5v-2h3z" fill="currentColor"/></svg>`;
  container.appendChild(resetViewBtn);

  const lockBtn = createToolbarButton("lock-btn", "Lock editing");
  container.appendChild(lockBtn);

  const edgeModeStatus = document.createElement("div");
  edgeModeStatus.id = "edge-mode-status";
  container.appendChild(edgeModeStatus);

  const groupStatus = document.createElement("div");
  groupStatus.id = "group-status";
  container.appendChild(groupStatus);

  const sidebar = document.createElement("div");
  sidebar.id = "sidebar";
  sidebar.innerHTML = `
    <div id="fill-color-wrapper" class="color-wrapper" title="Node color">
      <input type="color" id="fill-color" class="color-field">
      <span class="no-color-overlay"></span>
      <span class="color-clear">\u00d7</span>
    </div>
    <div id="text-color-wrapper" title="Label color">
      <span id="text-color-label">T</span>
      <input type="color" id="text-color" class="color-field">
    </div>
    <div id="border-color-wrapper" class="color-wrapper" title="Border color">
      <span id="border-color-label">\u25a2</span>
      <input type="color" id="border-color" class="color-field">
      <span class="no-color-overlay"></span>
      <span class="color-clear">\u00d7</span>
    </div>
    <select id="shape-select" title="Shape">
      <option value="">\u25ad</option>
      <option value="rounded-rectangle">\u25a2</option>
      <option value="ellipse">\u2b2d</option>
      <option value="diamond">\u25c7</option>
      <option value="parallelogram">\u25b1</option>
      <option value="trapezoid">\u23e2</option>
      <option value="triangle">\u25b3</option>
      <option value="cylinder">\u232d</option>
      <option value="pill">\u2296</option>
      <option value="half-ellipse">\u2313</option>
      <option value="half-pill">\u25d7</option>
      <option value="document">\u23b5</option>
      <option value="text">T</option>
    </select>
    <button id="rotate-btn" title="Rotate 90\u00b0">\u27f3</button>
  `;
  container.appendChild(sidebar);

  return {
    elements: { canvasContainer, lockBtn, resetViewBtn, snapBtn, edgeBtn, themeBtn },
    styleEl,
  };
}

function createToolbarButton(id: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = id;
  btn.className = "toolbar-btn";
  btn.title = title;
  return btn;
}

const EDITOR_CSS = `
.jumpgate-editor {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.jumpgate-editor #canvas-container {
  width: 100%;
  height: 100%;
  background: var(--vscode-editor-background, #1e1e1e);
}
.jumpgate-editor .toolbar-btn {
  position: absolute;
  top: 8px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-dropdown-background, #3a3d41);
  color: var(--vscode-dropdown-foreground, #cccccc);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 4px;
}
.jumpgate-editor .toolbar-btn:hover {
  background: var(--vscode-dropdown-background, #45494e);
}
.jumpgate-editor .toolbar-btn svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
.jumpgate-editor #lock-btn { right: 8px; }
.jumpgate-editor #reset-view-btn { right: 48px; }
.jumpgate-editor #snap-btn { right: 88px; }
.jumpgate-editor #edge-btn { right: 128px; }
.jumpgate-editor #theme-btn { right: 168px; }
.jumpgate-editor #sidebar {
  position: absolute;
  top: 48px;
  right: 8px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.jumpgate-editor .color-field {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #000;
  border-radius: 4px;
  background: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.jumpgate-editor .color-field::-webkit-color-swatch-wrapper { padding: 0; }
.jumpgate-editor .color-field::-webkit-color-swatch { border: none; }
.jumpgate-editor .color-field::-moz-color-swatch { border: none; }
.jumpgate-editor .color-wrapper {
  position: relative;
  overflow: visible;
}
.jumpgate-editor .color-clear {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #aa3333;
  color: white;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  cursor: pointer;
  z-index: 2;
  border: none;
  padding: 0;
}
.jumpgate-editor .color-clear:hover { background: #cc4444; }
.jumpgate-editor .color-wrapper.is-none .color-clear { display: none; }
.jumpgate-editor .no-color-overlay {
  display: none;
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  border-radius: 3px;
}
.jumpgate-editor .no-color-overlay::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255, 80, 80, 0.45) 3px, rgba(255, 80, 80, 0.45) 4px);
  border-radius: 3px;
}
.jumpgate-editor .color-wrapper.is-none .no-color-overlay { display: block; }
.jumpgate-editor #text-color-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
  border: 1px solid #000;
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
}
.jumpgate-editor #text-color-wrapper #text-color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.jumpgate-editor #text-color-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
  pointer-events: none;
}
.jumpgate-editor #border-color-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
  border: 3px solid #333333;
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
}
.jumpgate-editor #border-color-wrapper #border-color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.jumpgate-editor #border-color-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
  pointer-events: none;
  color: var(--vscode-dropdown-foreground, #cccccc);
}
.jumpgate-editor #shape-select {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #000;
  border-radius: 4px;
  background: var(--vscode-dropdown-background, #3a3d41);
  color: var(--vscode-dropdown-foreground, #cccccc);
  cursor: pointer;
  font-size: 16px;
  text-align: center;
  text-align-last: center;
  -webkit-appearance: none;
  appearance: none;
}
.jumpgate-editor #shape-select option {
  background: var(--vscode-dropdown-background, #3a3d41);
  color: var(--vscode-dropdown-foreground, #cccccc);
  text-align: center;
}
.jumpgate-editor #rotate-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #000;
  border-radius: 4px;
  background: var(--vscode-dropdown-background, #3a3d41);
  color: var(--vscode-dropdown-foreground, #cccccc);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.jumpgate-editor #rotate-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground, #45494e);
}
#context-menu {
  display: none;
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  background: var(--vscode-menu-background, var(--vscode-dropdown-background, #252526));
  color: var(--vscode-menu-foreground, var(--vscode-dropdown-foreground, #cccccc));
  border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, #454545));
  border-radius: 4px;
  padding: 4px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-family: var(--vscode-font-family, sans-serif);
  font-size: 12px;
}
.context-menu-item {
  padding: 6px 20px;
  cursor: pointer;
  white-space: nowrap;
}
.context-menu-item:hover {
  background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, #094771));
  color: var(--vscode-menu-selectionForeground, var(--vscode-list-hoverForeground, #ffffff));
}
.context-menu-separator {
  height: 1px;
  margin: 4px 8px;
  background: var(--vscode-menu-separatorBackground, var(--vscode-editorWidget-border, #454545));
}
#edge-mode-status {
  display: none;
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--vscode-editorWidget-background, #252526);
  color: var(--vscode-editorWidget-foreground, #cccccc);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  font-family: var(--vscode-font-family, sans-serif);
  font-size: 12px;
  z-index: 20;
  pointer-events: none;
  white-space: nowrap;
}
#group-status {
  display: none;
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--vscode-editorWidget-background, #252526);
  color: var(--vscode-editorWidget-foreground, #cccccc);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  font-family: var(--vscode-font-family, sans-serif);
  font-size: 12px;
  z-index: 20;
  pointer-events: auto;
  white-space: nowrap;
}
#group-status a {
  color: var(--vscode-textLink-foreground, #3794ff);
  cursor: pointer;
  text-decoration: none;
}
#group-status a:hover { text-decoration: underline; }
`;
