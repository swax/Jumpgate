import { BASE_FONT_SIZE } from "./textDefaults";
import { glyphRadius } from "./shapes";

interface LabelEntry {
  el: HTMLDivElement;
  worldX: number;
  worldY: number;
  /** Width in world units (node labels only). */
  width: number;
  /** Height in world units (node labels only). */
  height: number;
  kind: "node" | "edge";
  hasChildren: boolean;
  isSpace: boolean;
  /** True when layout-affecting properties changed since last syncPositions. */
  dirty: boolean;
}

export class DomLabelManager {
  private overlay: HTMLDivElement;
  private labels = new Map<string, LabelEntry>();
  private lastAppliedZoom = -1;

  constructor(canvasContainer: HTMLElement) {
    this.overlay = document.createElement("div");
    Object.assign(this.overlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      overflow: "hidden",
    });
    canvasContainer.style.position = "relative";
    canvasContainer.appendChild(this.overlay);
  }

  upsertNodeLabel(
    id: string,
    text: string,
    color: string,
    fontFamily: string,
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    hasChildren: boolean,
    isSpace: boolean,
  ): void {
    let entry = this.labels.get(id);
    if (!entry) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        top: "0",
        left: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflow: "visible",
        pointerEvents: "none",
        willChange: "transform",
        lineHeight: "1.2",
      });
      this.overlay.appendChild(el);
      entry = {
        el,
        worldX,
        worldY,
        width,
        height,
        kind: "node",
        hasChildren,
        isSpace,
        dirty: true,
      };
      this.labels.set(id, entry);
      // Force zoom-dependent styles on next sync
      this.lastAppliedZoom = -1;
    }

    entry.worldX = worldX;
    entry.worldY = worldY;
    if (
      entry.width !== width ||
      entry.height !== height ||
      entry.hasChildren !== hasChildren ||
      entry.isSpace !== isSpace
    ) {
      entry.dirty = true;
    }
    entry.width = width;
    entry.height = height;
    entry.hasChildren = hasChildren;
    entry.isSpace = isSpace;

    entry.el.textContent = text;
    entry.el.style.color = color;
    entry.el.style.fontFamily = fontFamily;
  }

  upsertEdgeLabel(
    id: string,
    text: string,
    color: string,
    fontFamily: string,
    worldX: number,
    worldY: number,
    isSpace: boolean,
  ): void {
    let entry = this.labels.get(id);
    if (!entry) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        top: "0",
        left: "0",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        willChange: "transform",
        lineHeight: "1.2",
      });
      this.overlay.appendChild(el);
      entry = {
        el,
        worldX,
        worldY,
        width: 0,
        height: 0,
        kind: "edge",
        hasChildren: false,
        isSpace,
        dirty: false,
      };
      this.labels.set(id, entry);
      this.lastAppliedZoom = -1;
    }

    entry.worldX = worldX;
    entry.worldY = worldY;
    entry.isSpace = isSpace;

    entry.el.textContent = text;
    entry.el.style.color = color;
    entry.el.style.fontFamily = fontFamily;
    entry.el.style.display = text ? "" : "none";
  }

  updateWorldPosition(
    id: string,
    worldX: number,
    worldY: number,
    width?: number,
    height?: number,
  ): void {
    const entry = this.labels.get(id);
    if (!entry) return;
    entry.worldX = worldX;
    entry.worldY = worldY;
    if (width !== undefined && entry.width !== width) {
      entry.width = width;
      entry.dirty = true;
    }
    if (height !== undefined && entry.height !== height) {
      entry.height = height;
      entry.dirty = true;
    }
  }

  removeLabel(id: string): void {
    const entry = this.labels.get(id);
    if (!entry) return;
    entry.el.remove();
    this.labels.delete(id);
  }

  hideLabel(id: string): void {
    const entry = this.labels.get(id);
    if (entry) entry.el.style.visibility = "hidden";
  }

  showLabel(id: string): void {
    const entry = this.labels.get(id);
    if (entry) entry.el.style.visibility = "";
  }

  getLabelText(id: string): string {
    const entry = this.labels.get(id);
    return entry ? (entry.el.textContent ?? "") : "";
  }

  getElement(id: string): HTMLDivElement | undefined {
    return this.labels.get(id)?.el;
  }

  syncPositions(zoom: number, vpX: number, vpY: number): void {
    const zoomChanged = zoom !== this.lastAppliedZoom;
    const fontSize = BASE_FONT_SIZE * zoom;

    for (const [, entry] of this.labels) {
      const { el, worldX, worldY, kind } = entry;

      if (kind === "node") {
        const screenX = worldX * zoom + vpX;
        const screenY = worldY * zoom + vpY;
        const screenW = entry.width * zoom;
        const screenH = entry.height * zoom;

        el.style.transform = `translate(${screenX}px, ${screenY}px)`;

        const needsUpdate = zoomChanged || entry.dirty;
        if (needsUpdate) {
          el.style.fontSize = `${fontSize}px`;
          el.style.width = `${screenW}px`;
          el.style.height = `${screenH}px`;

          if (entry.hasChildren) {
            el.style.alignItems = "flex-start";
            el.style.paddingTop = `${4 * zoom}px`;
          } else if (entry.isSpace) {
            el.style.alignItems = "flex-start";
            const gr = glyphRadius(entry.width, entry.height);
            el.style.paddingTop = `${(entry.height / 2 + gr + 4) * zoom}px`;
          } else {
            el.style.alignItems = "center";
            el.style.paddingTop = "0";
          }
          entry.dirty = false;
        }
      } else {
        // Edge label: centered at midpoint
        const screenX = worldX * zoom + vpX;
        const screenY = worldY * zoom + vpY;
        el.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%)`;

        if (zoomChanged) {
          el.style.fontSize = `${fontSize}px`;
        }
      }
    }

    if (zoomChanged) {
      this.lastAppliedZoom = zoom;
    }
  }
}
