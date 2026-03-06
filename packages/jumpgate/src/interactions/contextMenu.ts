import type { Application, Container } from "pixi.js";
import {
  getState,
  getNodeById,
  getEdgeById,
  setSelectedNodeIds,
  setSelectedEdgeIds,
} from "../state";
import { resolveEndpoint, buildPolylinePoints, pointToSegmentDistance } from "../canvas/canvasEdge";
import { copySelectedNodes, pasteNodes, cutSelectedNodes, deleteSelected, hasClipboard, setLastMouseWorldPos } from "./clipboard";
import { getCallbacks, sendEditDebounced } from "../messaging";

export interface ContextMenuOptions {
  showOpenFile: boolean;
  showEditFileLink: boolean;
  editFileLinkLabel?: string;
  showCut: boolean;
  showCopy: boolean;
  showPaste: boolean;
  showDelete: boolean;
  showViewSource: boolean;
  onOpenFile?: () => void;
  onEditFileLink?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onViewSource?: () => void;
}

let menuEl: HTMLDivElement | null = null;

function getOrCreateMenu(): HTMLDivElement {
  if (menuEl) return menuEl;

  menuEl = document.createElement("div");
  menuEl.id = "context-menu";
  document.body.appendChild(menuEl);

  // Close on click outside
  document.addEventListener("pointerdown", (e) => {
    if (menuEl && !menuEl.contains(e.target as HTMLElement)) {
      hideContextMenu();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });

  return menuEl;
}

function createMenuItem(label: string, onClick: () => void): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "context-menu-item";
  item.textContent = label;
  item.addEventListener("click", () => {
    onClick();
    hideContextMenu();
  });
  return item;
}

function createSeparator(): HTMLDivElement {
  const sep = document.createElement("div");
  sep.className = "context-menu-separator";
  return sep;
}

export function showContextMenu(x: number, y: number, options: ContextMenuOptions): void {
  const menu = getOrCreateMenu();
  menu.innerHTML = "";

  let itemCount = 0;

  if (options.showCut && options.onCut) {
    menu.appendChild(createMenuItem("Cut", options.onCut));
    itemCount++;
  }
  if (options.showCopy && options.onCopy) {
    menu.appendChild(createMenuItem("Copy", options.onCopy));
    itemCount++;
  }
  if (options.showPaste && options.onPaste) {
    menu.appendChild(createMenuItem("Paste", options.onPaste));
    itemCount++;
  }
  if (options.showDelete && options.onDelete) {
    menu.appendChild(createMenuItem("Delete", options.onDelete));
    itemCount++;
  }

  const hasFileLinkActions = (options.showOpenFile && options.onOpenFile) || (options.showEditFileLink && options.onEditFileLink);
  if (itemCount > 0 && hasFileLinkActions) {
    menu.appendChild(createSeparator());
  }

  if (options.showEditFileLink && options.onEditFileLink) {
    menu.appendChild(createMenuItem(options.editFileLinkLabel ?? "Set File Link", options.onEditFileLink));
    itemCount++;
  }
  if (options.showOpenFile && options.onOpenFile) {
    menu.appendChild(createMenuItem("Go to File Link", options.onOpenFile));
    itemCount++;
  }

  if (options.showViewSource && options.onViewSource) {
    if (itemCount > 0) menu.appendChild(createSeparator());
    menu.appendChild(createMenuItem("View Page Source", options.onViewSource));
    itemCount++;
  }

  if (itemCount === 0) return;

  menu.style.display = "block";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Ensure menu doesn't overflow viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  });
}

export function hideContextMenu(): void {
  if (menuEl) {
    menuEl.style.display = "none";
  }
}

export function setupContextMenu(app: Application, viewport: Container): void {
  // Right-click context menu via native event + manual world-coord hit testing
  app.canvas.addEventListener("mouseup", (e) => {
    if (e.button !== 2) return;

    // Convert screen coordinates to world coordinates
    const canvasRect = app.canvas.getBoundingClientRect();
    const canvasX = e.clientX - canvasRect.left;
    const canvasY = e.clientY - canvasRect.top;
    const worldX = (canvasX - viewport.position.x) / viewport.scale.x;
    const worldY = (canvasY - viewport.position.y) / viewport.scale.y;

    // Set paste position so context menu paste lands at the right-click location
    setLastMouseWorldPos(worldX, worldY);

    const state = getState();
    const { nodes, edges } = state.document;

    // Hit-test nodes (reverse order = highest z-index first)
    let targetId: string | null = null;
    let targetKind: "node" | "edge" | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (worldX >= n.bounds.x && worldX <= n.bounds.x + n.bounds.width &&
          worldY >= n.bounds.y && worldY <= n.bounds.y + n.bounds.height) {
        targetId = n.id;
        targetKind = "node";
        break;
      }
    }

    // Hit-test edges if no node was hit
    if (!targetId) {
      const nodeMap = new Map(nodes.map((n) => [n.id, n.bounds]));
      const hitTolerance = 8 / viewport.scale.x;
      for (let i = edges.length - 1; i >= 0; i--) {
        const edge = edges[i];
        const from = resolveEndpoint(edge.from, nodeMap);
        const to = resolveEndpoint(edge.to, nodeMap);
        if (!from || !to) continue;
        const points = buildPolylinePoints(from, to, edge.waypoints);
        for (let s = 1; s < points.length; s++) {
          const dist = pointToSegmentDistance(
            worldX, worldY,
            points[s - 1].x, points[s - 1].y,
            points[s].x, points[s].y
          );
          if (dist <= hitTolerance) {
            targetId = edge.id;
            targetKind = "edge";
            break;
          }
        }
        if (targetId) break;
      }
    }

    if (targetId && targetKind) {
      const fileLink = targetKind === "edge"
        ? getEdgeById(targetId)?.fileLink
        : getNodeById(targetId)?.fileLink;
      const hasFileLink = !!fileLink;

      if (state.locked) {
        showContextMenu(e.clientX, e.clientY, {
          showOpenFile: hasFileLink,
          showEditFileLink: false,
          showCut: false,
          showCopy: false,
          showPaste: false,
          showDelete: false,
          showViewSource: true,
          onOpenFile: hasFileLink ? () => {
            getCallbacks().onOpenFileLink?.(fileLink!.path, fileLink!.match);
          } : undefined,
          onViewSource: () => getCallbacks().onViewSource?.(),
        });
      } else {
        // Edit mode: select the item if not already selected
        if (targetKind === "node") {
          if (!state.selectedNodeIds.includes(targetId)) {
            setSelectedNodeIds([targetId]);
          }
        } else {
          if (!state.selectedEdgeIds.includes(targetId)) {
            setSelectedEdgeIds([targetId]);
          }
        }

        showContextMenu(e.clientX, e.clientY, {
          showOpenFile: hasFileLink,
          showEditFileLink: true,
          editFileLinkLabel: hasFileLink ? "Edit File Link" : "Set File Link",
          showCut: true,
          showCopy: true,
          showPaste: hasClipboard(),
          showDelete: true,
          showViewSource: true,
          onOpenFile: hasFileLink ? () => {
            getCallbacks().onOpenFileLink?.(fileLink!.path, fileLink!.match);
          } : undefined,
          onEditFileLink: () => {
            getCallbacks().onEditFileLink?.(targetId!, targetKind!, fileLink?.path, fileLink?.match);
          },
          onCut: () => cutSelectedNodes(sendEditDebounced),
          onCopy: () => copySelectedNodes(),
          onPaste: () => pasteNodes(sendEditDebounced),
          onDelete: () => deleteSelected(sendEditDebounced),
          onViewSource: () => getCallbacks().onViewSource?.(),
        });
      }
    } else {
      // Right-clicked on empty space
      showContextMenu(e.clientX, e.clientY, {
        showOpenFile: false,
        showEditFileLink: false,
        showCut: false,
        showCopy: false,
        showPaste: !state.locked && hasClipboard(),
        showDelete: false,
        showViewSource: true,
        onPaste: () => pasteNodes(sendEditDebounced),
        onViewSource: () => getCallbacks().onViewSource?.(),
      });
    }
  });

  // Hide context menu on left/middle click
  app.canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2) hideContextMenu();
  });
}
