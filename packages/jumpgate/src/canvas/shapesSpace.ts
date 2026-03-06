import { Graphics } from "pixi.js";
import type { NodeDirection, NodeShape } from "../schema";
import { directionToDeg, setBoxHitArea, glyphRadius } from "./shapes";

// ── Glow & nebula layers (space-only) ───────────────────────────

export function drawGlowLayer(
  gfx: Graphics,
  width: number,
  height: number,
  fillColor: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const r = glyphRadius(width, height);
  gfx.circle(cx, cy, r * 1.8).fill({ color: fillColor, alpha: 0.12 });
  gfx.circle(cx, cy, r * 1.3).fill({ color: fillColor, alpha: 0.08 });
  gfx.circle(cx, cy, r * 1.0).fill({ color: fillColor, alpha: 0.06 });
}

export function drawNebulaBg(
  gfx: Graphics,
  width: number,
  height: number,
  fillColor: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.max(width, height);

  const offsets = [
    { dx: -0.25, dy: -0.2, s: 0.35 },
    { dx: 0.2, dy: -0.15, s: 0.3 },
    { dx: 0.0, dy: 0.2, s: 0.25 },
    { dx: -0.15, dy: 0.05, s: 0.4 },
    { dx: 0.3, dy: 0.15, s: 0.28 },
    { dx: -0.1, dy: -0.3, s: 0.32 },
    { dx: 0.15, dy: 0.3, s: 0.22 },
    { dx: -0.3, dy: 0.2, s: 0.3 },
    { dx: 0.25, dy: -0.25, s: 0.26 },
    { dx: 0.0, dy: 0.0, s: 0.45 },
  ];
  for (const { dx, dy, s } of offsets) {
    const alpha = 0.04 + Math.abs(dx + dy) * 0.04;
    gfx.circle(cx + dx * width, cy + dy * height, size * s).fill({ color: fillColor, alpha });
  }

  const dashLen = 8;
  const gapLen = 6;
  const edges: [number, number, number, number][] = [
    [0, 0, width, 0],
    [width, 0, width, height],
    [width, height, 0, height],
    [0, height, 0, 0],
  ];
  for (const [x1, y1, x2, y2] of edges) {
    const edx = x2 - x1;
    const edy = y2 - y1;
    const len = Math.sqrt(edx * edx + edy * edy);
    if (len === 0) continue;
    const ux = edx / len;
    const uy = edy / len;
    let pos = 0;
    let drawing = true;
    while (pos < len) {
      const seg = drawing ? dashLen : gapLen;
      const end = Math.min(pos + seg, len);
      if (drawing) {
        gfx.moveTo(x1 + ux * pos, y1 + uy * pos);
        gfx.lineTo(x1 + ux * end, y1 + uy * end);
      }
      pos = end;
      drawing = !drawing;
    }
  }
  gfx.stroke({ width: 1, color: fillColor, alpha: 0.15 });

  setBoxHitArea(gfx, width, height);
}

// ── Space glyph shapes ──────────────────────────────────────────

function drawStar4(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const outer = r;
  const inner = r * 0.38;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    pts.push(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  }
  gfx.poly(pts);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
}

function drawBrightBall(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const bodyR = r * 0.45;
  if (fillColor !== null) {
    gfx.circle(cx, cy, bodyR * 2.2).fill({ color: fillColor, alpha: 0.08 });
    gfx.circle(cx, cy, bodyR * 1.6).fill({ color: fillColor, alpha: 0.15 });
  }
  gfx.circle(cx, cy, bodyR);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (fillColor !== null) {
    gfx
      .circle(cx - bodyR * 0.2, cy - bodyR * 0.2, bodyR * 0.35)
      .fill({ color: 0xffffff, alpha: 0.5 });
  }
}

function drawPlanet(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const bodyR = r * 0.6;
  gfx.circle(cx, cy, bodyR);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (strokeColor !== null) {
    const ringRx = r;
    const ringRy = r * 0.3;
    const pts: number[] = [];
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push(cx + Math.cos(t) * ringRx, cy + Math.sin(t) * ringRy);
    }
    gfx.poly(pts).stroke({ width: 1.5, color: strokeColor });
  }
}

function drawPulsar(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const s = r * 0.5;
  gfx.poly([cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy]);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (strokeColor !== null) {
    const tickLen = r * 0.4;
    const tickStart = s + 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const x1 = cx + Math.cos(angle) * tickStart;
      const y1 = cy + Math.sin(angle) * tickStart;
      const x2 = cx + Math.cos(angle) * (tickStart + tickLen);
      const y2 = cy + Math.sin(angle) * (tickStart + tickLen);
      gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1, color: strokeColor });
    }
    const diagLen = r * 0.25;
    const diagStart = s * 0.7 + 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const x1 = cx + Math.cos(angle) * diagStart;
      const y1 = cy + Math.sin(angle) * diagStart;
      const x2 = cx + Math.cos(angle) * (diagStart + diagLen);
      const y2 = cy + Math.sin(angle) * (diagStart + diagLen);
      gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1, color: strokeColor });
    }
  }
}

function drawComet(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
  deg: number,
): void {
  const rad = (deg * Math.PI) / 180;
  const headR = r * 0.3;
  const tailLen = r * 1.5;
  const tailSpread = r * 0.4;
  const dx = -Math.sin(rad);
  const dy = Math.cos(rad);
  const px = Math.cos(rad);
  const py = Math.sin(rad);
  const tailEndX = cx + dx * tailLen;
  const tailEndY = cy + dy * tailLen;
  if (fillColor !== null) {
    gfx
      .poly([
        cx - px * tailSpread,
        cy - py * tailSpread,
        tailEndX,
        tailEndY,
        cx + px * tailSpread,
        cy + py * tailSpread,
      ])
      .fill({ color: fillColor, alpha: 0.35 });
  }
  gfx.circle(cx, cy, headR);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
}

function drawStation(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
  deg: number,
): void {
  const rad = (deg * Math.PI) / 180;
  const s = r * 0.55;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6 + rad;
    pts.push(cx + Math.cos(angle) * s, cy + Math.sin(angle) * s);
  }
  gfx.poly(pts);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (strokeColor !== null) {
    const antLen = r * 0.5;
    for (const sign of [-1, 1]) {
      const ax = cx + Math.sin(rad) * sign * s;
      const ay = cy - Math.cos(rad) * sign * s;
      const bx = ax + Math.sin(rad) * sign * antLen;
      const by = ay - Math.cos(rad) * sign * antLen;
      gfx.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: strokeColor });
    }
  }
}

function drawShip(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
  deg: number,
): void {
  const rad = (deg * Math.PI) / 180;
  const s = r * 0.5;
  const tipX = cx - Math.sin(rad) * s;
  const tipY = cy + Math.cos(rad) * s;
  const leftX = cx + Math.sin(rad - (2 * Math.PI) / 3) * s;
  const leftY = cy - Math.cos(rad - (2 * Math.PI) / 3) * s;
  const rightX = cx + Math.sin(rad + (2 * Math.PI) / 3) * s;
  const rightY = cy - Math.cos(rad + (2 * Math.PI) / 3) * s;
  gfx.poly([tipX, tipY, leftX, leftY, rightX, rightY]);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (fillColor !== null) {
    gfx.circle(cx, cy, r * 0.15).fill({ color: 0xffffff, alpha: 0.6 });
  }
}

function drawWormhole(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  if (strokeColor !== null) {
    const rings = 3;
    for (let i = rings; i >= 1; i--) {
      const rx = r * (i / rings) * 0.9;
      const ry = rx * 0.55;
      const alpha = 0.3 + (i / rings) * 0.5;
      gfx.ellipse(cx, cy, rx, ry).stroke({ width: 1.5, color: strokeColor, alpha });
    }
  }
  if (fillColor !== null) {
    gfx.circle(cx, cy, r * 0.12).fill({ color: fillColor, alpha: 0.8 });
  }
}

function drawNebula(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  if (fillColor !== null) {
    const offsets = [
      { dx: -r * 0.25, dy: -r * 0.15, s: 0.55 },
      { dx: r * 0.2, dy: -r * 0.1, s: 0.5 },
      { dx: 0, dy: r * 0.2, s: 0.45 },
      { dx: -r * 0.1, dy: 0, s: 0.6 },
    ];
    for (const { dx, dy, s } of offsets) {
      gfx.circle(cx + dx, cy + dy, r * s).fill({ color: fillColor, alpha: 0.2 });
    }
    gfx.circle(cx, cy, r * 0.3).fill({ color: fillColor, alpha: 0.4 });
  }
  if (strokeColor !== null) {
    gfx.circle(cx, cy, r * 0.7).stroke({ width: 1, color: strokeColor, alpha: 0.3 });
  }
}

function drawMoon(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const bodyR = r * 0.6;
  gfx.circle(cx, cy, bodyR);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
  if (fillColor !== null) {
    gfx
      .circle(cx + bodyR * 0.4, cy - bodyR * 0.1, bodyR * 0.7)
      .fill({ color: 0x020408, alpha: 0.85 });
  }
}

function drawAsteroid(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const vertices = 8;
  const pts: number[] = [];
  const radii = [0.7, 0.9, 0.6, 1.0, 0.65, 0.85, 0.55, 0.95];
  for (let i = 0; i < vertices; i++) {
    const angle = (i / vertices) * Math.PI * 2;
    const vr = r * 0.5 * radii[i];
    pts.push(cx + Math.cos(angle) * vr, cy + Math.sin(angle) * vr);
  }
  gfx.poly(pts);
  if (fillColor !== null) gfx.fill(fillColor);
  if (strokeColor !== null) gfx.stroke({ width: 1.5, color: strokeColor });
}

function drawBeacon(
  gfx: Graphics,
  cx: number,
  cy: number,
  r: number,
  fillColor: number | null,
  strokeColor: number | null,
): void {
  const antTop = cy - r * 0.6;
  const antBottom = cy + r * 0.3;
  if (strokeColor !== null) {
    gfx.moveTo(cx, antTop).lineTo(cx, antBottom).stroke({ width: 2, color: strokeColor });
  }
  if (fillColor !== null) {
    gfx.circle(cx, antTop, r * 0.12).fill(fillColor);
  }
  if (strokeColor !== null) {
    const baseW = r * 0.35;
    gfx
      .moveTo(cx - baseW, antBottom)
      .lineTo(cx + baseW, antBottom)
      .stroke({ width: 2, color: strokeColor });
    for (let i = 1; i <= 3; i++) {
      const arcR = r * 0.2 * i;
      const segs = 12;
      const pts: number[] = [];
      for (let j = 0; j <= segs; j++) {
        const t = -Math.PI / 3 + (j / segs) * ((2 * Math.PI) / 3);
        pts.push(cx + Math.cos(t - Math.PI / 2) * arcR, antTop + Math.sin(t - Math.PI / 2) * arcR);
      }
      for (let j = 1; j < pts.length / 2; j++) {
        gfx.moveTo(pts[(j - 1) * 2], pts[(j - 1) * 2 + 1]);
        gfx.lineTo(pts[j * 2], pts[j * 2 + 1]);
      }
      gfx.stroke({ width: 1, color: strokeColor, alpha: 0.6 - i * 0.12 });
    }
  }
}

// ── Main entry point for space shape drawing ────────────────────

export function drawShapeSpace(
  gfx: Graphics,
  width: number,
  height: number,
  shape: NodeShape | undefined,
  fillColor: number | null,
  strokeColor: number | null,
  direction?: NodeDirection,
): void {
  const deg = directionToDeg(direction);
  const cx = width / 2;
  const cy = height / 2;
  const r = glyphRadius(width, height);

  gfx.pivot.set(0, 0);
  gfx.position.set(0, 0);
  gfx.rotation = 0;
  gfx.scale.set(1, 1);

  if (shape === "text" || (fillColor === null && strokeColor === null)) {
    setBoxHitArea(gfx, width, height);
    return;
  }

  switch (shape) {
    case "rounded-rectangle":
      drawBrightBall(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "ellipse":
      drawPlanet(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "diamond":
      drawPulsar(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "parallelogram":
      drawComet(gfx, cx, cy, r, fillColor, strokeColor, deg);
      break;
    case "trapezoid":
      drawStation(gfx, cx, cy, r, fillColor, strokeColor, deg);
      break;
    case "triangle":
      drawShip(gfx, cx, cy, r, fillColor, strokeColor, deg);
      break;
    case "cylinder":
      drawWormhole(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "pill":
      drawNebula(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "half-ellipse":
      drawMoon(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "half-pill":
      drawAsteroid(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "document":
      drawBeacon(gfx, cx, cy, r, fillColor, strokeColor);
      break;
    case "rectangle":
    default:
      drawStar4(gfx, cx, cy, r, fillColor, strokeColor);
      break;
  }

  setBoxHitArea(gfx, width, height);
}
