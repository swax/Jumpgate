# PixiJS v8 Flowchart Editor Reference

> [PixiJS Guides](https://pixijs.com/8.x/guides) | [API Reference](https://pixijs.download/dev/docs/) | [GitHub](https://github.com/pixijs/pixijs) | [v7->v8 Migration](https://pixijs.com/8.x/guides/migrations/v8)

## Core Architecture

> Docs: [Application](https://pixijs.com/8.x/guides/components/application), [Scene Graph](https://pixijs.com/8.x/guides/concepts/scene-graph), [Containers](https://pixijs.com/8.x/guides/components/scene-objects/container) | API: [Container](https://pixijs.download/dev/docs/scene.Container.html)

**Hierarchy:** `Application > app.stage (Container) > Container > (Graphics | Text)`

```typescript
import { Application, Container } from 'pixi.js';

const app = new Application();

// v8: async init required -- constructor takes no options
await app.init({
  resizeTo: window,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  preference: 'webgl',  // 'webgl' | 'webgpu' | 'canvas'
});
document.body.appendChild(app.canvas);

// Build scene graph with Containers as layers
const world = new Container({ isRenderGroup: true }); // GPU-accelerated transforms
const edgeLayer = new Container();
const nodeLayer = new Container();
world.addChild(edgeLayer, nodeLayer);
app.stage.addChild(world);

// UI overlay (not affected by pan/zoom)
const uiLayer = new Container();
app.stage.addChild(uiLayer);
```

**Container hierarchy for a flowchart:**
```
app.stage
  ├── world (Container, isRenderGroup) ← pan/zoom target
  │     ├── edgeLayer (Container)
  │     │     ├── Graphics (connector 1)
  │     │     └── Graphics (connector 2)
  │     └── nodeLayer (Container)
  │           ├── Container (Node 1: Graphics bg + Text label)
  │           └── Container (Node 2: Graphics bg + Text label)
  └── uiLayer (Container) ← selection rect, handles, overlays
```

**Key rules:**
- Only `Container` can have children -- `Graphics`, `Text`, `Sprite` are leaf nodes in v8
- `addChild()` auto-removes from previous parent (same as Konva)
- `container.label = 'myLabel'` for tagging; `getChildByLabel('myLabel', true)` for recursive search

**Core properties:**
```typescript
app.canvas      // HTMLCanvasElement
app.stage       // Root Container
app.ticker      // Frame loop (ticker.add((ticker) => { ticker.deltaTime }))
app.screen      // Rectangle { x, y, width, height } of viewport
```

**Key v7 -> v8 renames:**

| v7 | v8 |
|---|---|
| `container.name` | `container.label` |
| `new Text('Hello', style)` | `new Text({ text: 'Hello', style })` |
| `cacheAsBitmap = true` | `cacheAsTexture(true)` |
| `interactive = true` | `eventMode = 'static'` |
| `getBounds()` returns Rectangle | `getBounds()` returns Bounds; use `.rectangle` |
| `Ticker.add((dt) => ...)` | `Ticker.add((ticker) => { ticker.deltaTime })` |

---

## Graphics API (v8 Builder Pattern)

> Docs: [Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), [Fill](https://pixijs.com/8.x/guides/components/scene-objects/graphics/graphics-fill), [Pixel Line](https://pixijs.com/8.x/guides/components/scene-objects/graphics/graphics-pixel-line) | API: [Graphics](https://pixijs.download/dev/docs/scene.Graphics.html), [GraphicsContext](https://pixijs.download/dev/docs/scene.GraphicsContext.html)

In v8: **draw shape first, then apply fill/stroke** (opposite of v7's `beginFill`/`endFill`).

```typescript
import { Graphics, GraphicsContext } from 'pixi.js';

const g = new Graphics();

// Shapes (all return `this` for chaining)
g.rect(x, y, width, height);
g.roundRect(x, y, width, height, radius);
g.circle(x, y, radius);
g.ellipse(x, y, radiusX, radiusY);
g.poly(points);  // number[] or PointData[]

// Paths
g.moveTo(x, y);
g.lineTo(x, y);
g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
g.quadraticCurveTo(cpx, cpy, x, y);
g.arc(x, y, radius, startAngle, endAngle, counterclockwise?);
g.closePath();

// Fill + stroke (chain after shape)
g.roundRect(0, 0, 160, 60, 8)
  .fill({ color: 0x336699, alpha: 0.9 })
  .stroke({ width: 2, color: 0x88bbee });

// Stroke options
g.rect(0, 0, 100, 50).stroke({
  width: 2,
  color: 0x00ff00,
  alpha: 1,
  alignment: 0.5,  // 0=outside, 0.5=centered, 1=inside
  cap: 'round',     // 'butt' | 'round' | 'square'
  join: 'round',    // 'miter' | 'round' | 'bevel'
  pixelLine: false,  // true = always 1px regardless of zoom (fast, good for grids)
});

// Holes
g.rect(0, 0, 100, 100).fill(0x00ff00).circle(50, 50, 20).cut();

// Clear all drawing commands
g.clear();
```

**Shared geometry with GraphicsContext:**
```typescript
const nodeCtx = new GraphicsContext()
  .roundRect(0, 0, 160, 60, 8)
  .fill({ color: 0x336699 })
  .stroke({ width: 2, color: 0x88bbee });

const node1 = new Graphics(nodeCtx);
const node2 = new Graphics(nodeCtx); // same geometry, different transform
node2.position.set(200, 100);

// Swap context cheaply (NOT clear + rebuild every frame)
graphics.context = otherContext;
```

**Gotcha:** Do NOT `clear()` and rebuild Graphics every frame. For dynamic shapes, swap prebuilt `GraphicsContext` objects instead.

---

## Text Rendering

> Docs: [Text](https://pixijs.com/8.x/guides/components/scene-objects/text), [Styles](https://pixijs.com/8.x/guides/components/scene-objects/text/style), [BitmapText](https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap), [HTMLText](https://pixijs.com/8.x/guides/components/scene-objects/text/html)

```typescript
import { Text, TextStyle } from 'pixi.js';

// v8: object-form constructor
const label = new Text({
  text: 'Node Title',
  style: new TextStyle({
    fontFamily: 'Arial',
    fontSize: 14,
    fill: '#ffffff',
    align: 'center',
    wordWrap: true,
    wordWrapWidth: 200,
    padding: 4,  // prevents font cropping at edges
  }),
});
label.anchor.set(0.5); // center on position
```

**Which text type for a diagram editor:**

| Scenario | Use |
|---|---|
| Node labels (styled, infrequent updates) | **Text** -- best quality |
| Edge labels (many, simple) | **BitmapText** -- best performance |
| Rich tooltips / HTML formatting | **HTMLText** -- supports `<b>`, `<i>`, CSS |
| Editable text fields | DOM `<input>` / `<textarea>` overlay on canvas |

**Gotcha:** Canvas `Text` re-rasterizes on every `.text` change -- expensive. Use `BitmapText` for frequently updating text.

---

## Drag and Drop

> Docs: [Events](https://pixijs.com/8.x/guides/components/events) | Examples: [Dragging](https://pixijs.com/examples/events/dragging)

```typescript
import { FederatedPointerEvent, Point } from 'pixi.js';

let dragTarget: Container | null = null;
const dragOffset = new Point();

function onDragStart(e: FederatedPointerEvent) {
  const node = e.currentTarget as Container;
  dragTarget = node;
  const pos = node.parent.toLocal(e.global);
  dragOffset.set(pos.x - node.x, pos.y - node.y);
  node.alpha = 0.7;
}

function onDragMove(e: FederatedPointerEvent) {
  if (!dragTarget) return;
  const pos = dragTarget.parent.toLocal(e.global);
  dragTarget.x = pos.x - dragOffset.x;
  dragTarget.y = pos.y - dragOffset.y;
}

function onDragEnd() {
  if (!dragTarget) return;
  dragTarget.alpha = 1;
  dragTarget = null;
}

// Setup on each node
node.eventMode = 'static';
node.cursor = 'pointer';
node.on('pointerdown', onDragStart);

// Stage-level listeners
app.stage.eventMode = 'static';
app.stage.hitArea = app.screen;
app.stage.on('globalpointermove', onDragMove);
app.stage.on('pointerup', onDragEnd);
app.stage.on('pointerupoutside', onDragEnd);
```

**Snap to grid:**
```typescript
const GRID = 20;
function onDragMove(e: FederatedPointerEvent) {
  if (!dragTarget) return;
  const pos = dragTarget.parent.toLocal(e.global);
  dragTarget.x = Math.round((pos.x - dragOffset.x) / GRID) * GRID;
  dragTarget.y = Math.round((pos.y - dragOffset.y) / GRID) * GRID;
}
```

**Gotcha:** v8 fires `pointermove` ONLY when over a display object. Use `globalpointermove` on stage to get events everywhere. The stage also needs `hitArea = app.screen` to receive events on empty space.

**Gotcha (multi-node drag):** Same as Konva -- use absolute offsets from start positions, not incremental deltas, to avoid floating-point drift with grid snapping.

---

## Hit Detection / Interaction

> Docs: [Events Guide](https://pixijs.com/8.x/guides/components/events) | API: [EventMode](https://pixijs.download/release/docs/events.EventMode.html) | Examples: [Custom HitArea](https://pixijs.com/8.x/examples/events/custom-hitarea)

**eventMode values:**
```typescript
'none'     // Ignores ALL events including children. Best for perf.
'passive'  // DEFAULT. Ignores self, but children can still emit.
'auto'     // Hit tested only if parent is interactive.
'static'   // Emits events, is hit tested. Use for clickable/draggable.
'dynamic'  // Like static, also receives synthetic events when pointer is idle.

node.eventMode = 'static';
```

**Supported events (use pointer for mouse + touch):**
```typescript
'pointerdown' | 'pointerup' | 'pointerupoutside' | 'pointermove' |
'pointerover' | 'pointerout' | 'pointerenter' | 'pointerleave' |
'pointertap' | 'globalpointermove'
// Also: 'click', 'rightclick', 'wheel', 'touchstart', 'touchend', etc.
```

**Custom hit areas:**
```typescript
import { Rectangle, Circle, Polygon } from 'pixi.js';

node.hitArea = new Rectangle(0, 0, 160, 60);
circle.hitArea = new Circle(50, 50, 50);

// Fat hit area for thin lines (custom contains method)
lineGraphic.hitArea = {
  contains(x: number, y: number): boolean {
    const x1 = 0, y1 = 0, x2 = 200, y2 = 150;
    const tolerance = 8;
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
    const projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.hypot(x - projX, y - projY) <= tolerance;
  },
};
```

**Skip child hit traversal for performance:**
```typescript
container.interactiveChildren = false;
container.hitArea = new Rectangle(0, 0, 200, 100); // avoids bounds recalc
```

---

## Pan and Zoom

> Docs: [Scene Graph](https://pixijs.com/8.x/guides/concepts/scene-graph), [Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups)

Pan/zoom a `world` container inside the stage. Content goes in `world`, not `app.stage`.

```typescript
import { Container, FederatedPointerEvent, FederatedWheelEvent, Point } from 'pixi.js';

const world = new Container({ isRenderGroup: true });
app.stage.addChild(world);

// --- PAN (middle-click or Alt+drag) ---
let isPanning = false;
const panStart = new Point();

app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
  if (e.button === 1 || e.altKey) {
    isPanning = true;
    panStart.set(e.global.x - world.x, e.global.y - world.y);
  }
});
app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
  if (!isPanning) return;
  world.x = e.global.x - panStart.x;
  world.y = e.global.y - panStart.y;
});
app.stage.on('pointerup', () => { isPanning = false; });
app.stage.on('pointerupoutside', () => { isPanning = false; });

// --- ZOOM (wheel toward cursor) ---
app.stage.on('wheel', (e: FederatedWheelEvent) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const oldScale = world.scale.x;
  const newScale = Math.max(0.1, Math.min(5, oldScale * factor));

  const mouseLocal = world.toLocal(e.global);
  world.scale.set(newScale);
  const mouseAfter = world.toGlobal(mouseLocal);
  world.x += e.global.x - mouseAfter.x;
  world.y += e.global.y - mouseAfter.y;
});
```

**Screen <-> world coordinates:**
```typescript
function screenToWorld(screenX: number, screenY: number): Point {
  return world.toLocal(new Point(screenX, screenY));
}
function worldToScreen(worldX: number, worldY: number): Point {
  return world.toGlobal(new Point(worldX, worldY));
}
```

**Gotcha:** Same as Konva -- clicking empty space triggers panning if stage is the pan target. Distinguish from "click to deselect" with a modifier key or middle-mouse button.

---

## Selection

> Docs: [Events](https://pixijs.com/8.x/guides/components/events) | Note: PixiJS has **no built-in Transformer** (unlike Konva). `@pixi-essentials/transformer` does NOT support v8.

**Rubber-band selection:**
```typescript
const selectionRect = new Graphics();
selectionRect.visible = false;
app.stage.addChild(selectionRect);

let isSelecting = false;
let selStart = new Point();
const selectedNodes: Container[] = [];

app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
  if (e.button !== 0) return;
  // Only start selection on empty space (not on a node)
  isSelecting = true;
  selStart = world.toLocal(e.global);
  selectionRect.visible = true;
});

app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
  if (!isSelecting) return;
  const cur = world.toLocal(e.global);
  const x = Math.min(selStart.x, cur.x);
  const y = Math.min(selStart.y, cur.y);
  const w = Math.abs(cur.x - selStart.x);
  const h = Math.abs(cur.y - selStart.y);

  selectionRect.clear()
    .rect(x, y, w, h)
    .fill({ color: 0x3399ff, alpha: 0.15 })
    .stroke({ width: 1, color: 0x3399ff, alpha: 0.8 });

  // Match world transform so rect appears in world space
  selectionRect.position.copyFrom(world.position);
  selectionRect.scale.copyFrom(world.scale);
});

app.stage.on('pointerup', (e: FederatedPointerEvent) => {
  if (!isSelecting) return;
  isSelecting = false;
  selectionRect.visible = false;

  const cur = world.toLocal(e.global);
  const selBounds = new Rectangle(
    Math.min(selStart.x, cur.x), Math.min(selStart.y, cur.y),
    Math.abs(cur.x - selStart.x), Math.abs(cur.y - selStart.y),
  );

  selectedNodes.length = 0;
  for (const node of nodeLayer.children) {
    const nb = node.getBounds().rectangle;
    const nodeRect = new Rectangle(node.x, node.y, nb.width / world.scale.x, nb.height / world.scale.y);
    if (rectanglesIntersect(selBounds, nodeRect)) {
      selectedNodes.push(node as Container);
    }
  }
});

function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}
```

**Custom resize handles (manual Transformer):**
```typescript
type HandlePos = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br';

function createResizeHandles(target: Container): Map<HandlePos, Graphics> {
  const handles = new Map<HandlePos, Graphics>();
  const SIZE = 8;
  const positions: [HandlePos, number, number][] = [
    ['tl', 0, 0], ['tc', 0.5, 0], ['tr', 1, 0],
    ['ml', 0, 0.5],                ['mr', 1, 0.5],
    ['bl', 0, 1], ['bc', 0.5, 1], ['br', 1, 1],
  ];
  const bounds = target.getLocalBounds();

  for (const [pos, fx, fy] of positions) {
    const handle = new Graphics()
      .rect(-SIZE / 2, -SIZE / 2, SIZE, SIZE)
      .fill(0xffffff)
      .stroke({ width: 1, color: 0x3399ff });

    handle.x = bounds.minX + bounds.width * fx;
    handle.y = bounds.minY + bounds.height * fy;
    handle.eventMode = 'static';
    handle.cursor = getCursorForHandle(pos);

    handle.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      startResize(target, pos, e);
    });

    handles.set(pos, handle);
    target.parent.addChild(handle);
  }
  return handles;
}

const CURSORS: Record<HandlePos, string> = {
  tl: 'nwse-resize', tc: 'ns-resize', tr: 'nesw-resize',
  ml: 'ew-resize',                     mr: 'ew-resize',
  bl: 'nesw-resize', bc: 'ns-resize', br: 'nwse-resize',
};
function getCursorForHandle(pos: HandlePos): string { return CURSORS[pos]; }
```

**Selection highlight outline:**
```typescript
function drawSelectionOutline(node: Container, highlight: Graphics) {
  const bounds = node.getLocalBounds();
  const PAD = 4;
  highlight.clear()
    .rect(bounds.minX - PAD, bounds.minY - PAD, bounds.width + PAD * 2, bounds.height + PAD * 2)
    .stroke({ width: 1.5, color: 0x3399ff });
  highlight.position.copyFrom(node.position);
}
```

---

## Connecting Lines / Arrows

> Docs: [Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics)

**Drawing an arrow:**
```typescript
function drawArrow(g: Graphics, fromX: number, fromY: number, toX: number, toY: number,
                   headLength = 12, headWidth = 8) {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  // Shaft
  g.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: 2, color: 0xcccccc });

  // Arrowhead triangle
  const ax = toX - headLength * Math.cos(angle - Math.PI / 6);
  const ay = toY - headLength * Math.sin(angle - Math.PI / 6);
  const bx = toX - headLength * Math.cos(angle + Math.PI / 6);
  const by = toY - headLength * Math.sin(angle + Math.PI / 6);
  g.moveTo(toX, toY).lineTo(ax, ay).lineTo(bx, by).closePath().fill(0xcccccc);
}
```

**Bezier curve connector:**
```typescript
function drawBezierConnector(g: Graphics, x1: number, y1: number, x2: number, y2: number) {
  const midX = (x1 + x2) / 2;
  g.moveTo(x1, y1).bezierCurveTo(midX, y1, midX, y2, x2, y2)
   .stroke({ width: 2, color: 0xaaaaaa });
}
```

**Rect edge-to-edge connector (finds intersection with rectangle boundary):**
```typescript
interface Rect { x: number; y: number; width: number; height: number; }

function getRectEdgePoint(rect: Rect, targetX: number, targetY: number) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = targetX - cx, dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const scale = (Math.abs(dx) / (rect.width / 2) > Math.abs(dy) / (rect.height / 2))
    ? (rect.width / 2) / Math.abs(dx)
    : (rect.height / 2) / Math.abs(dy);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
```

**Update connectors on drag with onRender:**
```typescript
edge.onRender = () => {
  const fRect = { x: nodeA.x, y: nodeA.y, width: 160, height: 60 };
  const tRect = { x: nodeB.x, y: nodeB.y, width: 160, height: 60 };
  const from = getRectEdgePoint(fRect, nodeB.x + 80, nodeB.y + 30);
  const to = getRectEdgePoint(tRect, nodeA.x + 80, nodeA.y + 30);
  edge.clear();
  drawArrow(edge, from.x, from.y, to.x, to.y);
};
```

**Gotcha:** Unlike Konva's `dragmove` event, PixiJS has no built-in drag event on nodes. Use `onRender` or manually trigger updates from the drag handler.

---

## Coordinate Transforms

> Docs: [Scene Graph](https://pixijs.com/8.x/guides/concepts/scene-graph) | API: [toLocal/toGlobal](https://pixijs.download/dev/docs/scene.ToLocalGlobalMixin.html), [Bounds](https://pixijs.download/dev/docs/rendering.Bounds.html)

```typescript
// Convert between coordinate spaces
container.toGlobal(localPoint);                // local -> screen
container.toLocal(globalPoint);                // screen -> local
container.toLocal(pointInA, containerA);       // containerA-space -> local

// Get absolute screen position
container.getGlobalPosition();

// Transform properties
container.position     // { x, y } relative to parent
container.scale        // { x, y }
container.rotation     // radians
container.pivot        // { x, y } transform origin
container.worldTransform  // Matrix - cumulative (read-only)
container.localTransform  // Matrix - this container only

// Bounds (v8: returns Bounds, not Rectangle)
const bounds = container.getBounds();
bounds.minX; bounds.minY; bounds.width; bounds.height;
bounds.rectangle;            // Rectangle (lazily created)
bounds.containsPoint(x, y);

const localBounds = container.getLocalBounds(); // in own space, ignoring transforms
```

**Screen -> world (with pan/zoom):**
```typescript
function getWorldPointer(screenX: number, screenY: number) {
  return world.toLocal(new Point(screenX, screenY));
}

// Node local -> screen (for DOM overlays like text editors)
function nodeToScreen(node: Container) {
  return node.toGlobal(new Point(0, 0));
}
```

**Gotcha:** `getBounds()` returns `Bounds` (not `Rectangle` like v7). Use `.rectangle` property to get a `Rectangle`.

---

## Inline Text Editing

> Same pattern as Konva: hide canvas text, overlay a DOM `<textarea>` at the same position.

```typescript
function startTextEdit(textNode: Text, world: Container, canvas: HTMLCanvasElement) {
  textNode.visible = false;
  const screenPos = textNode.toGlobal(new Point(0, 0));
  const canvasRect = canvas.getBoundingClientRect();
  const scale = world.scale.x;

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = textNode.text;
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${canvasRect.top + screenPos.y}px`,
    left: `${canvasRect.left + screenPos.x}px`,
    width: `${textNode.width * scale}px`,
    fontSize: `${textNode.style.fontSize * scale}px`,
    fontFamily: textNode.style.fontFamily,
    border: 'none', padding: '0', background: 'none', outline: 'none', resize: 'none',
    color: textNode.style.fill as string,
  });
  textarea.focus();

  const commit = () => { textNode.text = textarea.value; textarea.remove(); textNode.visible = true; };
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) commit();
    if (e.key === 'Escape') { textarea.remove(); textNode.visible = true; }
  });
  textarea.addEventListener('blur', commit);
}
```

**Gotcha:** Must account for world scale + position when calculating textarea CSS, same as Konva.

---

## Custom Shapes

> Docs: [Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics)

```typescript
// Diamond (decision node) -- using Graphics path
function drawDiamond(g: Graphics, w: number, h: number, fill: number, stroke: number) {
  g.moveTo(w / 2, 0)
   .lineTo(w, h / 2)
   .lineTo(w / 2, h)
   .lineTo(0, h / 2)
   .closePath()
   .fill(fill)
   .stroke({ width: 2, color: stroke });
}

// Rounded rect with connection ports
function drawNodeWithPorts(g: Graphics, w: number, h: number) {
  g.roundRect(0, 0, w, h, 8)
   .fill(0xffffff)
   .stroke({ width: 2, color: 0x333333 });

  // Ports
  [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }].forEach((p) => {
    g.circle(p.x, p.y, 5).fill(0x4caf50);
  });
}
```

---

## Container Hierarchy & Z-Order

> Docs: [Container](https://pixijs.com/8.x/guides/components/scene-objects/container), [Render Layers](https://pixijs.com/8.x/guides/concepts/render-layers)

```typescript
// Child management
container.addChild(child1, child2);
container.addChildAt(child, index);
container.removeChild(child);
container.swapChildren(child1, child2);
otherContainer.reparentChild(child);   // move to another parent

// Z-ordering
container.sortableChildren = true;
child1.zIndex = 1;
child2.zIndex = 10;  // renders on top

// Child events
container.on('childAdded', (child, container, index) => { /* ... */ });
container.on('childRemoved', (child, container, index) => { /* ... */ });

// Per-frame callback (v8 replacement for updateTransform)
container.onRender = () => { /* update connectors, animations */ };
```

**Render Layers (decoupled draw order):**
```typescript
import { RenderLayer } from 'pixi.js';

const worldLayer = new RenderLayer();
const uiLayer = new RenderLayer();
app.stage.addChild(worldLayer, uiLayer);

worldLayer.attach(nodeContainer); // renders in layer order
uiLayer.attach(toolbar);         // always on top
```

**Gotcha:** Removing an object from its logical parent auto-detaches from RenderLayers. Re-adding does NOT auto-reattach -- you must call `layer.attach()` again.

---

## Performance Tips

> Docs: [Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips), [cacheAsTexture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture), [Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups)

| Technique | Usage |
|---|---|
| `eventMode = 'none'` | Non-interactive shapes/layers |
| `interactiveChildren = false` | Skip hit-test traversal for subtrees |
| `hitArea = new Rectangle(...)` | Avoid expensive bounds recalculation |
| `cacheAsTexture()` | Static containers with many children |
| `isRenderGroup: true` | Large subtrees that pan/scale together (GPU transforms) |
| `cullable = true` | Skip rendering off-screen nodes (disabled by default in v8) |
| `GraphicsContext` swap | Dynamic shapes (avoid `clear()` + rebuild per frame) |
| `pixelLine: true` on stroke | Grid lines / guides (no triangulation, GPU-direct) |
| `BitmapText` over `Text` | Frequently updating text |
| Sprite + atlas | Many identical shapes (render to texture, use as Sprite) |

**cacheAsTexture:**
```typescript
complexNode.cacheAsTexture({ resolution: 2, antialias: true });
complexNode.updateCacheTexture(); // call after modifying children
complexNode.cacheAsTexture(false); // disable
```

**Render groups (GPU-level transforms for pan/zoom):**
```typescript
const world = new Container({ isRenderGroup: true });
// Moving/scaling is nearly free on CPU, even with thousands of children
```

**Gotcha:** Don't use too many render groups per-node -- they don't batch together. Use one for the world container.

---

## Undo/Redo

Same approach as Konva -- use your own state model, not PixiJS serialization:

```typescript
interface AppState {
  nodes: NodeData[];
  connectors: ConnectorData[];
}

const history: string[] = [];
let step = -1;

function saveState(state: AppState) {
  history.length = step + 1;
  history.push(JSON.stringify(state));
  step++;
}

function undo(): AppState | null {
  if (step <= 0) return null;
  return JSON.parse(history[--step]);
}

function redo(): AppState | null {
  if (step >= history.length - 1) return null;
  return JSON.parse(history[++step]);
}
```

---

## Quick Reference Table

| Task | Key API |
|---|---|
| Create node | `new Container()` + child `Graphics` + `Text` |
| Draggable | `eventMode = 'static'` + `pointerdown` / `globalpointermove` |
| Update connectors on drag | `edge.onRender = () => { ... }` or manual in drag handler |
| Select | Set highlight outline on `Graphics`, manage selection array |
| Rubber-band select | Draw `Graphics` rect, test `rectanglesIntersect` per node |
| Resize | Manual resize handles (no built-in Transformer) |
| Zoom to cursor | `world.toLocal()` + scale + position adjustment |
| Pan | Middle-click/Alt + `globalpointermove` on world container |
| Inline text edit | Hide `Text`, overlay DOM `<textarea>` |
| Serialize | Own state model + `JSON.stringify` |
| Custom shapes | `Graphics` path API (`moveTo`, `lineTo`, `bezierCurveTo`) |
| Fat click target | Custom `hitArea` with `contains()` method |
| Optimize statics | `cacheAsTexture()`, `eventMode = 'none'` |
| GPU pan/zoom | `new Container({ isRenderGroup: true })` |
