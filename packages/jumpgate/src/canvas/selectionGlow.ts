import { BlurFilter, Container, Graphics } from "pixi.js";
import { getNodeById, getEdgeById } from "../state";

const GLOW_COLOR = 0x4488ff;
const SPACE_GLOW_COLOR = 0x44ccff;
const SECONDARY_GLOW_COLOR = 0x9944ff;
const SPACE_SECONDARY_GLOW_COLOR = 0xbb66ff;
const GLOW_BLUR_STRENGTH = 3;
const GLOW_BLUR_QUALITY = 4;

export class SelectionGlowManager {
  private viewport: Container;
  private selectionGlows = new Map<string, Graphics>();
  private glowPulse = 0;

  constructor(viewport: Container) {
    this.viewport = viewport;
  }

  update(
    selectedNodeIds: string[],
    selectedEdgeIds: string[],
    locked: boolean,
    nodeZIndexMap: Map<string, number>,
    theme?: string
  ): void {
    if (!locked) {
      for (const [, gfx] of this.selectionGlows) {
        this.viewport.removeChild(gfx);
        gfx.destroy();
      }
      this.selectionGlows.clear();
      return;
    }

    const isSpace = theme === "space";
    const primaryColor = isSpace ? SPACE_GLOW_COLOR : GLOW_COLOR;
    const secondaryColor = isSpace ? SPACE_SECONDARY_GLOW_COLOR : SECONDARY_GLOW_COLOR;

    // Compute secondary nodes: endpoints of selected edges not in primary selection
    const primarySet = new Set(selectedNodeIds);
    const secondaryNodeIds = new Set<string>();
    for (const edgeId of selectedEdgeIds) {
      const edge = getEdgeById(edgeId);
      if (!edge) continue;
      if ("nodeId" in edge.from && !primarySet.has(edge.from.nodeId)) {
        secondaryNodeIds.add(edge.from.nodeId);
      }
      if ("nodeId" in edge.to && !primarySet.has(edge.to.nodeId)) {
        secondaryNodeIds.add(edge.to.nodeId);
      }
    }

    // All nodes that need a glow
    const allGlowIds = new Set([...selectedNodeIds, ...secondaryNodeIds]);

    // Remove glows for nodes no longer needing one
    for (const [id, gfx] of this.selectionGlows) {
      if (!allGlowIds.has(id)) {
        this.viewport.removeChild(gfx);
        gfx.destroy();
        this.selectionGlows.delete(id);
      }
    }

    // Add/update glows
    for (const nodeId of allGlowIds) {
      const node = getNodeById(nodeId);
      if (!node) continue;

      let glow = this.selectionGlows.get(nodeId);
      if (!glow) {
        glow = new Graphics();
        glow.label = `__sel_glow_${nodeId}`;
        glow.eventMode = "none";
        this.viewport.addChild(glow);
        this.selectionGlows.set(nodeId, glow);
      }

      const { x, y, width, height } = node.bounds;
      const nodeZ = nodeZIndexMap.get(nodeId) ?? 1000;
      glow.zIndex = nodeZ - 0.1;

      const color = secondaryNodeIds.has(nodeId) ? secondaryColor : primaryColor;
      this.drawNodeGlow(glow, x, y, width, height, color);
    }
  }

  pulse(deltaMS: number, selectedEdgeIds: string[], viewport: Container): void {
    if (this.selectionGlows.size === 0 && selectedEdgeIds.length === 0) return;

    this.glowPulse = (this.glowPulse + deltaMS * 0.001) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.glowPulse * Math.PI * 2);
    const alpha = 0.6 + 0.4 * pulse;

    // Pulse node glows
    for (const [, gfx] of this.selectionGlows) {
      gfx.alpha = alpha;
    }

    // Pulse edge glows
    for (const edgeId of selectedEdgeIds) {
      const edgeContainer = viewport.getChildByLabel(edgeId) as Container | null;
      if (!edgeContainer) continue;
      const edgeGlow = edgeContainer.getChildByLabel("edge-glow") as Graphics | null;
      if (edgeGlow?.visible) {
        edgeGlow.alpha = alpha;
      }
    }
  }

  dispose(): void {
    for (const [, gfx] of this.selectionGlows) {
      this.viewport.removeChild(gfx);
      gfx.destroy();
    }
    this.selectionGlows.clear();
  }

  private drawNodeGlow(glow: Graphics, x: number, y: number, width: number, height: number, color: number): void {
    glow.clear();
    glow.roundRect(x - 4, y - 4, width + 8, height + 8, 6)
      .stroke({ color, width: 3, alpha: 1.0 });
    glow.roundRect(x - 2, y - 2, width + 4, height + 4, 4)
      .stroke({ color: 0xffffff, width: 3, alpha: 1.0 });
    if (!glow.filters || !(glow.filters as BlurFilter[])[0]) {
      glow.filters = [new BlurFilter({ strength: GLOW_BLUR_STRENGTH, quality: GLOW_BLUR_QUALITY })];
    }
  }
}
