# Konva.js Flowchart Editor Reference

> [Konva Overview](https://konvajs.org/docs/overview.html) | [API Reference](https://konvajs.org/api/Konva.Node.html) | [GitHub](https://github.com/konvajs/konva)

## Core Architecture

> Docs: [Groups](https://konvajs.org/docs/groups_and_layers/Groups.html) | API: [Stage](https://konvajs.org/api/Konva.Stage.html), [Layer](https://konvajs.org/api/Konva.Layer.html), [Group](https://konvajs.org/api/Konva.Group.html)

**Hierarchy:** `Stage > Layer > (Group | Shape)`

```typescript
const stage = new Konva.Stage({ container: 'container', width: 800, height: 600 });

// Each Layer = separate <canvas>. Minimize layer count.
const backgroundLayer = new Konva.Layer();  // grid, static (listening: false)
const mainLayer = new Konva.Layer();        // nodes, connectors
const uiLayer = new Konva.Layer();          // transformer, selection rect

stage.add(backgroundLayer, mainLayer, uiLayer);

// Groups let you move/transform children as a unit
const nodeGroup = new Konva.Group({ x: 100, y: 100, draggable: true });
nodeGroup.add(new Konva.Rect({ width: 120, height: 60, fill: '#fff', stroke: '#333' }));
nodeGroup.add(new Konva.Text({ text: 'Hello', padding: 10 }));
mainLayer.add(nodeGroup);
```

**Key rules:**
- A node can only belong to one parent -- `add()` auto-removes from previous parent
- `layer.batchDraw()` throttles redraws to animation frame rate (use in hot paths)
- `stage.find('.myName')` / `stage.findOne('#myId')` -- CSS-like selectors by `name`/`id` attrs

---

## Drag and Drop

> Docs: [Drag and Drop](https://konvajs.org/docs/drag_and_drop/Drag_and_Drop.html), [Complex Drag Bounds](https://konvajs.org/docs/drag_and_drop/Complex_Drag_and_Drop.html), [Snap to Grid](https://konvajs.org/docs/sandbox/Objects_Snapping.html)

```typescript
const rect = new Konva.Rect({ x: 50, y: 50, width: 100, height: 60, draggable: true });

rect.on('dragstart', (e) => { /* save initial position */ });
rect.on('dragmove', (e) => { /* update connectors, snap to grid */ });
rect.on('dragend', (e) => { /* commit position, save undo state */ });
```

**Snap to grid:**
```typescript
const GRID = 20;
rect.on('dragmove', () => {
  rect.position({
    x: Math.round(rect.x() / GRID) * GRID,
    y: Math.round(rect.y() / GRID) * GRID,
  });
});
```

**Gotcha:** Dragging a `Konva.Line` changes `x`/`y`, NOT the `points` array. Always account for node position offset when reading point coordinates.

---

## Resizing with Transformer

> Docs: [Basic Demo](https://konvajs.org/docs/select_and_transform/Basic_demo.html), [Resize Limits](https://konvajs.org/docs/select_and_transform/Resize_Limits.html), [Transform Events](https://konvajs.org/docs/select_and_transform/Transform_Events.html) | API: [Transformer](https://konvajs.org/api/Konva.Transformer.html)

```typescript
const tr = new Konva.Transformer({
  nodes: [rect],
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right',
                   'middle-left', 'middle-right', 'top-center', 'bottom-center'],
  keepRatio: false,
  rotateEnabled: false,  // disable for flowchart nodes
  boundBoxFunc: (oldBox, newBox) => {
    if (Math.abs(newBox.width) < 40 || Math.abs(newBox.height) < 30) return oldBox;
    return newBox;
  },
});
uiLayer.add(tr);
```

**Normalize size after transform** (Transformer modifies scaleX/Y, not width/height):
```typescript
rect.on('transformend', () => {
  rect.width(rect.width() * rect.scaleX());
  rect.height(rect.height() * rect.scaleY());
  rect.scaleX(1);
  rect.scaleY(1);
});
```

**Multi-node:** `tr.nodes([rect1, rect2, rect3]);`

**Gotcha:** `boundBoxFunc` box values can be negative (when flipped). Use `Math.abs()`.

---

## Connecting Lines / Arrows

> Docs: [Connected Objects](https://konvajs.org/docs/sandbox/Connected_Objects.html), [Modify Curves with Anchors](https://konvajs.org/docs/sandbox/Modify_Curves_with_Anchor_Points.html) | API: [Arrow](https://konvajs.org/api/Konva.Arrow.html), [Line](https://konvajs.org/api/Konva.Line.html)

**Basic connector:**
```typescript
const arrow = new Konva.Arrow({
  points: [fromX, fromY, toX, toY],
  stroke: '#333', fill: '#333', strokeWidth: 2,
  pointerLength: 10, pointerWidth: 8,
});

// Update on drag
nodeA.on('dragmove', () => arrow.points(getConnectorPoints(nodeA, nodeB)));
nodeB.on('dragmove', () => arrow.points(getConnectorPoints(nodeA, nodeB)));
```

**Rect edge-to-edge connector (finds intersection with rectangle boundary):**
```typescript
function getRectEdgePoint(rect: Konva.Rect, targetPos: { x: number; y: number }) {
  const pos = rect.getAbsolutePosition();
  const w = rect.width() * rect.scaleX();
  const h = rect.height() * rect.scaleY();
  const cx = pos.x + w / 2;
  const cy = pos.y + h / 2;
  const dx = targetPos.x - cx;
  const dy = targetPos.y - cy;
  const angle = Math.atan2(dy, dx);
  const absCos = Math.abs(Math.cos(angle));
  const absSin = Math.abs(Math.sin(angle));
  const dist = (w / 2 * absSin <= h / 2 * absCos)
    ? (w / 2) / absCos
    : (h / 2) / absSin;
  return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
}
```

**Curved lines:**
```typescript
// Auto-curved with tension
new Konva.Line({ points: [x1, y1, x2, y2, x3, y3], stroke: '#333', tension: 0.5 });

// Manual bezier via custom shape
new Konva.Shape({
  stroke: '#333', strokeWidth: 2,
  sceneFunc: (ctx, shape) => {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.fillStrokeShape(shape);
  },
});
```

---

## Pan and Zoom

> Docs: [Zoom Relative to Pointer](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html)

**Wheel zoom to cursor:**
```typescript
const SCALE_BY = 1.05;

stage.on('wheel', (e) => {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition()!;
  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };
  const direction = e.evt.deltaY > 0 ? -1 : 1;
  const newScale = Math.max(0.1, Math.min(5, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY));
  stage.scale({ x: newScale, y: newScale });
  stage.position({
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  });
});
```

**Pan:** `stage.draggable(true);`

**Gotcha:** When stage is draggable, clicking empty space starts panning. Distinguish from "click to deselect" -- either use a modifier key for pan, or middle-mouse button, or only pan when Space is held.

---

## Selection

> Docs: [Select and Transform](https://konvajs.org/docs/select_and_transform/Basic_demo.html)

**Click + rubber-band + shift-multi-select:**
```typescript
const tr = new Konva.Transformer({ rotateEnabled: false });
uiLayer.add(tr);

const selectionRect = new Konva.Rect({
  fill: 'rgba(0,120,255,0.2)', stroke: 'rgba(0,120,255,0.8)', visible: false,
});
uiLayer.add(selectionRect);

let selecting = false;
let x1 = 0, y1 = 0;

stage.on('mousedown', (e) => {
  if (e.target !== stage) return;
  selecting = true;
  const pos = stage.getRelativePointerPosition()!;
  x1 = pos.x; y1 = pos.y;
  selectionRect.setAttrs({ x: x1, y: y1, width: 0, height: 0, visible: true });
});

stage.on('mousemove', () => {
  if (!selecting) return;
  const pos = stage.getRelativePointerPosition()!;
  selectionRect.setAttrs({
    x: Math.min(x1, pos.x), y: Math.min(y1, pos.y),
    width: Math.abs(pos.x - x1), height: Math.abs(pos.y - y1),
  });
});

stage.on('mouseup', () => {
  if (!selecting) return;
  selecting = false;
  selectionRect.visible(false);
  const box = selectionRect.getClientRect();
  const selected = mainLayer.getChildren((n) => Konva.Util.haveIntersection(box, n.getClientRect()));
  tr.nodes(selected);
});

// Click select / deselect
stage.on('click tap', (e) => {
  if (selecting) return;
  if (e.target === stage) { tr.nodes([]); return; }
  if (e.evt.shiftKey) {
    const nodes = tr.nodes().slice();
    const idx = nodes.indexOf(e.target);
    idx >= 0 ? nodes.splice(idx, 1) : nodes.push(e.target);
    tr.nodes(nodes);
  } else {
    tr.nodes([e.target]);
  }
});
```

---

## Hit Detection

> Docs: [Custom Hit Region](https://konvajs.org/docs/events/Custom_Hit_Region.html)

Konva uses a hidden hit canvas with unique colors per shape -- O(1) pixel lookup.

```typescript
// Enlarge hit area for thin lines
line.hitStrokeWidth(20);

// Custom simplified hit region
shape.hitFunc((ctx, shape) => {
  ctx.beginPath();
  ctx.rect(0, 0, shape.getAttr('width'), shape.getAttr('height'));
  ctx.fillStrokeShape(shape);
});

// Disable hit detection on decorative shapes
backgroundGrid.listening(false);
```

---

## Performance Tips

> Docs: [All Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html), [Listening False](https://konvajs.org/docs/performance/Listening_False.html), [Shape Caching](https://konvajs.org/docs/performance/Shape_Caching.html), [Batch Draw](https://konvajs.org/docs/performance/Batch_Draw.html)

| Technique | Usage |
|---|---|
| `layer.listening(false)` | Static/decorative layers |
| `shape.listening(false)` | Non-interactive shapes |
| `group.cache()` / `clearCache()` | Complex groups that change infrequently |
| `layer.batchDraw()` | In `mousemove`/`dragmove` handlers (1 draw/frame) |
| `shape.perfectDrawEnabled(false)` | Shapes with stroke+shadow |
| Move to drag layer | `node.moveTo(dragLayer)` during drag to avoid redrawing main layer |
| Viewport culling | Hide shapes outside visible area (manual check) |

---

## Undo/Redo

> Docs: [Serialization Best Practices](https://konvajs.org/docs/data_and_serialization/Best_Practices.html)

**Use your own state model, not Konva serialization:**
```typescript
interface AppState {
  nodes: NodeData[];
  connectors: ConnectorData[];
}

const history: string[] = [];
let step = -1;

function saveState(state: AppState) {
  history.length = step + 1;  // truncate redo stack
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

**Why not `stage.toJSON()`?** -- Doesn't serialize events/images/cache, bloated, requires full reconstruction. Own state is smaller and easier to diff.

---

## Inline Text Editing

> Docs: [Editable Text](https://konvajs.org/docs/sandbox/Editable_Text.html)

Double-click text -> hide Konva text -> overlay a DOM `<textarea>` at the same position:

```typescript
textNode.on('dblclick', () => {
  textNode.hide();
  const absPos = textNode.getAbsolutePosition();
  const stageBox = stage.container().getBoundingClientRect();

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = textNode.text();
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${stageBox.top + absPos.y}px`,
    left: `${stageBox.left + absPos.x}px`,
    width: `${textNode.width() * stage.scaleX()}px`,
    fontSize: `${textNode.fontSize() * stage.scaleX()}px`,
    border: 'none', padding: '0', background: 'none', outline: 'none', resize: 'none',
  });
  textarea.focus();

  const commit = () => { textNode.text(textarea.value); textarea.remove(); textNode.show(); };
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) commit();
    if (e.key === 'Escape') { textarea.remove(); textNode.show(); }
  });
  textarea.addEventListener('blur', commit);
});
```

**Gotcha:** Must account for stage scale + position when calculating textarea CSS.

---

## Custom Shapes

> Docs: [Custom Shape](https://konvajs.org/docs/shapes/Custom.html) | API: [Shape](https://konvajs.org/api/Konva.Shape.html)

```typescript
// Diamond (decision node)
new Konva.Shape({
  width: 120, height: 80, fill: '#ffe0b2', stroke: '#e65100', draggable: true,
  sceneFunc: (ctx, shape) => {
    const w = shape.getAttr('width'), h = shape.getAttr('height');
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.fillStrokeShape(shape);  // applies Konva fill/stroke/shadow attrs
  },
});

// Rounded rect with connection ports
new Konva.Shape({
  width: 160, height: 80, fill: '#fff', stroke: '#333',
  sceneFunc: (ctx, shape) => {
    const w = shape.getAttr('width'), h = shape.getAttr('height'), r = 8;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fillStrokeShape(shape);
    // Ports (raw canvas API after fillStrokeShape)
    [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }].forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#4caf50'; ctx.fill();
    });
  },
});
```

**Gotcha:** Don't allocate heavy objects (Images, etc.) inside `sceneFunc` -- it runs every redraw.

---

## Coordinate Transforms

> Docs: [Relative Pointer Position](https://konvajs.org/docs/sandbox/Relative_Pointer_Position.html) | API: [Node](https://konvajs.org/api/Konva.Node.html)

```typescript
// Screen pointer position (relative to stage container)
stage.getPointerPosition();            // { x, y } in screen px

// Pointer in local coords of any node (accounts for all parent transforms)
someNode.getRelativePointerPosition(); // { x, y } in node-local space

// Absolute position of a node (accounts for parent chain)
shape.getAbsolutePosition();

// World coords when stage is panned/zoomed
function getWorldPointer() {
  const p = stage.getPointerPosition()!;
  const s = stage.scaleX();
  return { x: (p.x - stage.x()) / s, y: (p.y - stage.y()) / s };
}

// Manual transform math
const t = node.getAbsoluteTransform();
t.point({ x, y });                     // local -> absolute
t.copy().invert().point({ x, y });     // absolute -> local

// Bounding box in absolute coords (for intersection tests)
shape.getClientRect();                  // { x, y, width, height }
```

**Gotcha:** `getPointerPosition()` returns screen coords. When panned/zoomed, use `getRelativePointerPosition()` or manual transform. Always use `getRelativePointerPosition()` on the appropriate ancestor when placing shapes.

---

## Events Quick Ref

> Docs: [Binding Events](https://konvajs.org/docs/events/Binding_Events.html), [Transform Events](https://konvajs.org/docs/select_and_transform/Transform_Events.html)

```typescript
node.on('dragstart dragmove dragend', handler);       // drag lifecycle
node.on('mouseenter mouseleave', handler);            // hover (set cursor)
node.on('click tap', handler);                        // click/touch
node.on('dblclick dbltap', handler);                  // double-click
node.on('transformstart transform transformend', h);  // resize/rotate
node.on('contextmenu', (e) => { e.evt.preventDefault(); /* custom menu */ });
stage.on('wheel', handler);                           // zoom

// e.target = actual shape, e.currentTarget = listener node, e.evt = native event
// Events bubble: Shape -> Group -> Layer -> Stage

// Namespaced events for easy cleanup
node.on('click.myFeature', handler);
node.off('click.myFeature');
```

---

## Other Useful Demos

> [Free Drawing](https://konvajs.org/docs/sandbox/Free_Drawing.html) | [Keep Ratio on Resize](https://konvajs.org/docs/select_and_transform/Keep_Ratio.html)

---

## Quick Reference Table

| Task | Key API |
|---|---|
| Create node | `new Konva.Group` + child shapes |
| Draggable | `group.draggable(true)` |
| Update connectors on drag | `node.on('dragmove', updateConnectors)` |
| Select | `transformer.nodes([node])` |
| Rubber-band select | `Konva.Util.haveIntersection(box, node.getClientRect())` |
| Resize | `Transformer` + `boundBoxFunc` |
| Zoom to cursor | `stage.on('wheel', ...)` + scale math |
| Pan | `stage.draggable(true)` or manual position |
| Inline text edit | `dblclick` + DOM textarea overlay |
| Serialize | Own state model + `JSON.stringify` |
| Custom shapes | `new Konva.Shape({ sceneFunc })` |
| Fat click target | `hitStrokeWidth` on lines, `hitFunc` on shapes |
| Optimize statics | Separate layer + `listening(false)` |
