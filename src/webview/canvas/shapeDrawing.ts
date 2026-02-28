import { Graphics } from "pixi.js";
import type { NodeDirection, NodeShape } from "../../schema";
import { drawShapeSpace, drawGlowLayer, drawNebulaBg } from "./spaceShapes";

// Re-export space-only functions so existing imports still work
export { drawGlowLayer, drawNebulaBg } from "./spaceShapes";

// ═══════════════════════════════════════════════════════════════════
//  Shared helpers (exported for spaceShapes.ts)
// ═══════════════════════════════════════════════════════════════════

export function directionToDeg(d: NodeDirection | undefined): number {
  switch (d) {
    case "right": return 90;
    case "down": return 180;
    case "left": return 270;
    default: return 0;
  }
}

export function setBoxHitArea(gfx: Graphics, width: number, height: number): void {
  gfx.hitArea = {
    x: 0,
    y: 0,
    width,
    height,
    contains: (px: number, py: number) =>
      px >= 0 && px <= width && py >= 0 && py <= height,
  };
}

export function glyphRadius(width: number, height: number): number {
  return Math.max(8, Math.min(width, height) * 0.35);
}

// ═══════════════════════════════════════════════════════════════════
//  Standard theme — full bounding-box fills with rotation support
// ═══════════════════════════════════════════════════════════════════

const STROKE_WIDTH = 2;
const ELLIPSE_SEGMENTS = 48;
const CORNER_SEGMENTS = 8;

function applyStyle(gfx: Graphics, fillColor: number | null, strokeColor: number | null): void {
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: STROKE_WIDTH, color: strokeColor });
}

function transformVertices(
  flatPts: number[],
  width: number,
  height: number,
  rotationDeg: number
): number[] {
  const cx = width / 2;
  const cy = height / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotated: number[] = [];
  for (let i = 0; i < flatPts.length; i += 2) {
    const dx = flatPts[i] - cx;
    const dy = flatPts[i + 1] - cy;
    rotated.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < rotated.length; i += 2) {
    minX = Math.min(minX, rotated[i]);
    maxX = Math.max(maxX, rotated[i]);
    minY = Math.min(minY, rotated[i + 1]);
    maxY = Math.max(maxY, rotated[i + 1]);
  }

  const bbW = maxX - minX;
  const bbH = maxY - minY;
  const sx = bbW > 0 ? width / bbW : 1;
  const sy = bbH > 0 ? height / bbH : 1;
  const bbCx = (minX + maxX) / 2;
  const bbCy = (minY + maxY) / 2;

  const result: number[] = [];
  for (let i = 0; i < rotated.length; i += 2) {
    result.push(
      (rotated[i] - bbCx) * sx + cx,
      (rotated[i + 1] - bbCy) * sy + cy
    );
  }
  return result;
}

function ellipseVertices(cx: number, cy: number, rx: number, ry: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  return pts;
}

function roundRectVertices(w: number, h: number, r: number): number[] {
  r = Math.min(r, w / 2, h / 2);
  const pts: number[] = [];
  const corners = [
    { cx: w - r, cy: r, start: -Math.PI / 2, end: 0 },
    { cx: w - r, cy: h - r, start: 0, end: Math.PI / 2 },
    { cx: r, cy: h - r, start: Math.PI / 2, end: Math.PI },
    { cx: r, cy: r, start: Math.PI, end: (3 * Math.PI) / 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= CORNER_SEGMENTS; i++) {
      const t = c.start + (i / CORNER_SEGMENTS) * (c.end - c.start);
      pts.push(c.cx + r * Math.cos(t), c.cy + r * Math.sin(t));
    }
  }
  return pts;
}

function getShapeVertices(width: number, height: number, shape: NodeShape | undefined): number[] | null {
  switch (shape) {
    case "rounded-rectangle":
      return roundRectVertices(width, height, 10);
    case "ellipse":
      return ellipseVertices(width / 2, height / 2, width / 2, height / 2);
    case "diamond": {
      const cx = width / 2;
      const cy = height / 2;
      return [cx, 0, width, cy, cx, height, 0, cy];
    }
    case "parallelogram": {
      const offset = width * 0.2;
      return [offset, 0, width, 0, width - offset, height, 0, height];
    }
    case "trapezoid": {
      const offset = width * 0.15;
      return [offset, 0, width - offset, 0, width, height, 0, height];
    }
    case "triangle": {
      const cx = width / 2;
      return [cx, 0, width, height, 0, height];
    }
    case "pill":
      return null;
    case "half-ellipse": {
      const pts: number[] = [];
      const halfSegs = ELLIPSE_SEGMENTS / 2;
      for (let i = 0; i <= halfSegs; i++) {
        const t = Math.PI + (i / halfSegs) * Math.PI;
        pts.push(width / 2 + (width / 2) * Math.cos(t), height + height * Math.sin(t));
      }
      pts.push(width, height);
      pts.push(0, height);
      return pts;
    }
    case "half-pill":
      return null;
    case "document": {
      const amp = height * 0.1;
      const waveSegs = 20;
      const pts: number[] = [];
      pts.push(0, 0);
      pts.push(width, 0);
      pts.push(width, height - amp);
      for (let i = 0; i <= waveSegs; i++) {
        const t = i / waveSegs;
        const x = width * (1 - t);
        const y = height - amp + Math.sin(t * Math.PI * 2) * amp;
        pts.push(x, y);
      }
      pts.push(0, 0);
      return pts;
    }
    case "rectangle":
    default:
      return [0, 0, width, 0, width, height, 0, height];
    case "cylinder":
      return null;
    case "text":
      return null;
  }
}

function drawShapeStandard(
  gfx: Graphics,
  width: number,
  height: number,
  shape: NodeShape | undefined,
  fillColor: number | null,
  strokeColor: number | null,
  direction?: NodeDirection
): void {
  const deg = directionToDeg(direction);

  gfx.pivot.set(0, 0);
  gfx.position.set(0, 0);
  gfx.rotation = 0;
  gfx.scale.set(1, 1);

  if (shape === "text" || (fillColor === null && strokeColor === null)) {
    setBoxHitArea(gfx, width, height);
    return;
  }

  if (deg !== 0) {
    const verts = getShapeVertices(width, height, shape);
    if (verts) {
      const transformed = transformVertices(verts, width, height, deg);
      gfx.poly(transformed); applyStyle(gfx, fillColor, strokeColor);
      setBoxHitArea(gfx, width, height);
      return;
    }
  }

  switch (shape) {
    case "rounded-rectangle":
      gfx.roundRect(0, 0, width, height, 10); applyStyle(gfx, fillColor, strokeColor);
      break;

    case "ellipse":
      gfx.ellipse(width / 2, height / 2, width / 2, height / 2); applyStyle(gfx, fillColor, strokeColor);
      break;

    case "diamond": {
      const cx = width / 2;
      const cy = height / 2;
      gfx.poly([cx, 0, width, cy, cx, height, 0, cy]); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "parallelogram": {
      const offset = width * 0.2;
      gfx.poly([offset, 0, width, 0, width - offset, height, 0, height]); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "trapezoid": {
      const offset = width * 0.15;
      gfx.poly([offset, 0, width - offset, 0, width, height, 0, height]); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "triangle": {
      const cx = width / 2;
      gfx.poly([cx, 0, width, height, 0, height]); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "pill": {
      const swap = deg === 90 || deg === 270;
      const dw = swap ? height : width;
      const dh = swap ? width : height;
      gfx.roundRect(0, 0, dw, dh, Math.min(dw, dh) / 2); applyStyle(gfx, fillColor, strokeColor);
      if (deg !== 0) {
        const rad = (deg * Math.PI) / 180;
        gfx.pivot.set(dw / 2, dh / 2);
        gfx.position.set(width / 2, height / 2);
        gfx.rotation = rad;
      }
      break;
    }

    case "half-ellipse": {
      const pts: number[] = [];
      const halfSegs = ELLIPSE_SEGMENTS / 2;
      for (let i = 0; i <= halfSegs; i++) {
        const t = Math.PI + (i / halfSegs) * Math.PI;
        pts.push(width / 2 + (width / 2) * Math.cos(t), height + height * Math.sin(t));
      }
      pts.push(width, height);
      pts.push(0, height);
      gfx.poly(pts); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "half-pill": {
      const swap = deg === 90 || deg === 270;
      const dw = swap ? height : width;
      const dh = swap ? width : height;
      const r = dh / 2;
      const pts: number[] = [];
      pts.push(0, 0);
      pts.push(dw - r, 0);
      for (let i = 0; i <= CORNER_SEGMENTS * 2; i++) {
        const t = -Math.PI / 2 + (i / (CORNER_SEGMENTS * 2)) * Math.PI;
        pts.push(dw - r + r * Math.cos(t), r + r * Math.sin(t));
      }
      pts.push(dw - r, dh);
      pts.push(0, dh);
      gfx.poly(pts); applyStyle(gfx, fillColor, strokeColor);
      if (deg !== 0) {
        const rad = (deg * Math.PI) / 180;
        gfx.pivot.set(dw / 2, dh / 2);
        gfx.position.set(width / 2, height / 2);
        gfx.rotation = rad;
      }
      break;
    }

    case "document": {
      const amp = height * 0.1;
      const waveSegs = 20;
      const pts: number[] = [];
      pts.push(0, 0);
      pts.push(width, 0);
      pts.push(width, height - amp);
      for (let i = 0; i <= waveSegs; i++) {
        const t = i / waveSegs;
        const x = width * (1 - t);
        const y = height - amp + Math.sin(t * Math.PI * 2) * amp;
        pts.push(x, y);
      }
      pts.push(0, 0);
      gfx.poly(pts); applyStyle(gfx, fillColor, strokeColor);
      break;
    }

    case "cylinder": {
      const swap = deg === 90 || deg === 270;
      const dw = swap ? height : width;
      const dh = swap ? width : height;
      const ry = Math.min(dh * 0.15, 20);
      gfx.ellipse(dw / 2, dh - ry, dw / 2, ry); applyStyle(gfx, fillColor, strokeColor);
      if (fillColor !== null) gfx.rect(0, ry, dw, dh - 2 * ry).fill(fillColor);
      if (strokeColor !== null) {
        gfx.moveTo(0, ry).lineTo(0, dh - ry).stroke({ width: STROKE_WIDTH, color: strokeColor });
        gfx.moveTo(dw, ry).lineTo(dw, dh - ry).stroke({ width: STROKE_WIDTH, color: strokeColor });
      }
      gfx.ellipse(dw / 2, ry, dw / 2, ry); applyStyle(gfx, fillColor, strokeColor);
      if (deg !== 0) {
        const rad = (deg * Math.PI) / 180;
        gfx.pivot.set(dw / 2, dh / 2);
        gfx.position.set(width / 2, height / 2);
        gfx.rotation = rad;
      }
      break;
    }

    case "rectangle":
    default:
      gfx.rect(0, 0, width, height); applyStyle(gfx, fillColor, strokeColor);
      break;
  }

  setBoxHitArea(gfx, width, height);
}

// ═══════════════════════════════════════════════════════════════════
//  Unified public API
// ═══════════════════════════════════════════════════════════════════

export function drawShape(
  gfx: Graphics,
  width: number,
  height: number,
  shape: NodeShape | undefined,
  fillColor: number | null,
  strokeColor: number | null,
  direction?: NodeDirection,
  theme?: string
): void {
  if (theme === "space") {
    drawShapeSpace(gfx, width, height, shape, fillColor, strokeColor, direction);
  } else {
    drawShapeStandard(gfx, width, height, shape, fillColor, strokeColor, direction);
  }
}
