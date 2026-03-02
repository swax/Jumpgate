# Architecture

VS Code custom editor extension for `.vscp` files. Renders an interactive PixiJS canvas where users can select, drag, resize, color, and label nodes. Changes sync bidirectionally with the underlying JSON document.

## Data Flow

```
.vscp file (JSON on disk)
    ↕ Ctrl+S saves / Ctrl+Z undoes
In-memory TextDocument (VS Code)
    ↕ postMessage (update ↓, edit ↑)
Webview (PixiJS canvas)
```

Edits from the canvas apply via `WorkspaceEdit` which marks the tab dirty (does NOT write to disk). The webview updates optimistically for instant feedback.

## File Map

```
src/
  extension.ts            Activation: registers VscpEditorProvider + perspective.linkToNode command
  schema.ts               Zod schemas (nodeSchema, edgeSchema, fileLinkSchema, documentSchema) + types; nodeSchema includes optional shape (enum), direction ("up"|"right"|"down"|"left", omitted when "up"), borderColor (per-node stroke override), and parentId (string, for node grouping); edgeSchema includes optional waypoints, label, color, labelColor, style, arrow, and fileLink
  messages.ts             Typed message protocol (extension ↔ webview) — includes openFileLink, editFileLink/fileLinkResult
  vscpEditorProvider.ts   CustomTextEditorProvider — HTML shell, CSP, two-way messaging, openFileLink handler, editFileLink handler (QuickPick for workspace files/URL/remove + optional match InputBox)
  webview/
    main.ts               Entry point — PixiJS Application, viewport container, wires up all modules; delegates messaging, starfield, context menu, and Ctrl-key suppression to dedicated modules
    messaging.ts          VS Code postMessage wrapper, debounced edit sender, nodeChanged/nodesChanged/edgeChanged helpers
    state.ts              Pub/sub store (EditorState: document + selectedNodeIds[] + selectedEdgeIds[] + edgeMode + locked + snapToGrid); helpers: setSelection(), getConnectedEdgeIds(), getConnectedNodeIds()
    renderer.ts           Reconciles PixiJS node containers against state, manages selection overlay, instantiates DomLabelManager and syncs label positions each frame; delegates edge reconciliation to edgeReconciler and selection glows to SelectionGlowManager
    globals.d.ts          acquireVsCodeApi type declaration
    canvas/
      canvasNode.ts       Node container factory (shape Graphics) + drag/click/dblclick handlers
      shapeDrawing.ts     Centralized drawShape() + directionToDeg() — 13 shape types, direction-based orientation within bounding box
      canvasEdge.ts       Edge container factory (Graphics "edge-line") + polyline rendering (waypoints) + arrowhead rendering + endpoint resolution + double-click label editing; exports buildPolylinePoints, computePolylineMidpoint, pointToSegmentDistance, PolylineHitArea
      domLabels.ts        DomLabelManager — renders node/edge labels as native DOM divs over the canvas for crisp text at any zoom; syncs world→screen positions each frame via CSS transform
      textDefaults.ts     Constants: BASE_FONT_SIZE, DEFAULT_FONT_FAMILY
      edgeUtils.ts        Shared edge utilities: findNodeAtPoint (with optional excludeIds), computeAnchor, buildEndpoint, dot constants
      selectionOverlay.ts Dashed bounding box + 8 resize handles for selected nodes (edit mode); solid outline without handles (locked mode — though glow is used instead, see below)
      selectionGlow.ts    SelectionGlowManager class — owns glow Graphics for selected nodes in locked mode; update() adds/removes glows, pulse() animates alpha each frame; also pulses edge glow Graphics
      edgeReconciler.ts   reconcileEdges() function + buildNodeMap/computeEdgeZIndex helpers — diffs edge state against PixiJS containers, applies drag overrides, upserts DOM labels; all dependencies via explicit EdgeReconcilerContext (no closure variables)
      edgeHandleOverlay.ts Draggable endpoint handles on selected edges — drag to reposition from/to; also manages waypoint handles (pooled Graphics) with drag-to-move and Ctrl+double-click to remove
      starfield.ts        Creates randomized star Graphics layer + subscribes to state for theme-based background/starfield toggling
    controls/
      lockToggle.ts       Lock button UI — toggles editing, hides sidebar, disables interactions
      gridSnap.ts         Snap-to-grid toggle button and snap() utility (GRID_SIZE = 20)
      sidebar.ts          Sidebar controls for fill color, label color, border color, shape dropdown, and direction rotate button — works for both nodes (nodeColor/labelColor/borderColor) and edges (color/labelColor); shape, rotate, and border color disabled for edges
    interactions/
      panZoom.ts          Viewport panning and mouse-wheel zoom-to-cursor; Ctrl-key grab suppression is internal; returns PanZoomControls with setSuppressGrab() for compatibility
      contextMenu.ts      DOM context menu (show/hide) + setupContextMenu() — right-click hit-testing (screen→world, node/edge), context menu wiring (locked vs edit mode, file link, cut/copy/paste/delete)
      keyboard.ts         Keyboard shortcuts (Delete, Ctrl+C/V) and clipboard state — copy/paste includes descendants
      edgeMode.ts         Edge creation mode — toolbar toggle, two-click workflow, preview line + cursor dot
      groupStatus.ts      Group status bar — shows parent info on selection, drag-to-group messages, remove-from-group link
      labelEditor.ts      DOM textarea overlay for inline label editing on double-click (nodes and edges); hides/shows DOM labels via DomLabelManager; Enter commits, Shift+Enter for newline, Escape cancels
      selectionBox.ts     Shift+drag rubber-band selection box + click-off deselect
      cursorManager.ts    Centralized cursor priority manager (pan/select)
```

## Container Hierarchy

```
app.stage                         (background click-to-deselect)
  └─ viewport                     (sortableChildren — pan/zoom transform)
      ├─ edge containers          (zIndex derived from connected nodes — see below)
      │   └─ Graphics "edge-line" (line/arrows, eventMode: "static", owns hitArea)
      ├─ node containers          (zIndex depth-based, eventMode: "static")
      │   ├─ Graphics "node-glow" (space theme glow layer, eventMode: "none")
      │   └─ Graphics "node-rect" (shape graphic, optionally rotated via pivot)
      ├─ selection glow Graphics   (locked mode only, zIndex nodeZ − 0.1, eventMode: "none")
      ├─ SelectionOverlay         (zIndex 9000, eventMode: "passive")
      │   ├─ Graphics             (dashed outline)
      │   └─ Graphics × 8         (resize handles)
      └─ EdgeHandleOverlay        (zIndex 9001, eventMode: "passive")
          ├─ Graphics × 2         (from/to endpoint handles)
          └─ Graphics × N         (waypoint handles, pooled — shown when edge selected)

canvas container (HTML)
  ├─ <canvas>                     (PixiJS WebGL canvas)
  └─ DOM label overlay <div>      (pointer-events: none, positioned over canvas)
      ├─ node label <div> × N     (flexbox centered, CSS transform for world→screen)
      └─ edge label <div> × M     (centered at polyline midpoint via translate(-50%,-50%))
```

Z-index layers (bottom to top): depth-0 nodes (1000+i), depth-0 text nodes (1500+i), depth-1 nodes (2000+i), depth-1 text nodes (2500+i), etc. Edges sit just below the higher of their two connected nodes (max node zIndex − 0.5). Dragged nodes temporarily boost to 8900+. Overlays at 9000+. Depth is determined by `parentId` ancestry chain — children render above parents.

## Build

Two esbuild bundles (`npm run build`):
- **Extension**: `src/extension.ts` → `dist/extension.js` (CJS, Node, vscode externalized)
- **Webview**: `src/webview/main.ts` → `dist/webview.js` (IIFE, browser, PixiJS bundled in)

## Key Patterns

### Data Flow & State

- **Pub/sub store** (`state.ts`): Simple reactive state — `EditorState` holds document, `selectedNodeIds[]`, `selectedEdgeIds[]`, edgeMode, locked, and snapToGrid flags. Subscribers (renderer) are notified on any change. `updateNodes()` batches multiple node changes into a single notify.
- **Reconciliation** (`renderer.ts`, `edgeReconciler.ts`): Diffs state against existing PixiJS containers by ID — creates, updates, or destroys as needed. Node reconciliation lives in `renderer.ts`; edge reconciliation is in `edgeReconciler.ts` via `reconcileEdges()`. Skips nodes mid-drag to avoid fighting user input. Upserts DOM labels for nodes and edges on each render; removes DOM labels when nodes/edges are deleted.
- **Echo guard** (`vscpEditorProvider.ts`): `isApplyingEdit` flag prevents `onDidChangeTextDocument` from echoing back edits the webview just made.
- **Debounced edits** (`messaging.ts`): Canvas changes are batched (100ms) before posting to the extension to avoid spamming WorkspaceEdits.

### Rendering

- **DOM labels** (`domLabels.ts`): Replaces PixiJS `Text` objects with native browser `<div>` elements for crisp text at any zoom level. PixiJS `Text` pre-rasterizes to a canvas texture, and no amount of resolution/mipmap tuning could prevent blurry text when the GPU downscaled at zoom levels below 1x. Native DOM text sidesteps this entirely — the browser renders at the actual CSS font-size with full hinting and subpixel AA. An overlay div sits over the canvas; each label is positioned via `transform: translate(screenX, screenY)` (GPU-composited, no layout reflow). The ticker calls `syncPositions()` every frame to convert world coordinates to screen coordinates. Font size scales linearly with zoom (`BASE_FONT_SIZE * zoom`). Zoom-dependent styles (fontSize, width, height, padding) are only updated when zoom changes; transform updates every frame.
- **Live edge following** (`edgeReconciler.ts`): `buildNodeMap` always reads live container positions/sizes, so edges follow during both node drag (`onDragUpdate` from `canvasNode`) and node resize (`onDragUpdate` from `selectionOverlay`). During edge handle drags, `reconcileEdges` applies the overlay’s endpoint override and waypoint override to draw the edge at the in-flight position. All dependencies are passed via an explicit `EdgeReconcilerContext` — no closure variables to shadow.
- **Selection glows** (`selectionGlow.ts`): `SelectionGlowManager` owns glow Graphics for selected nodes in locked mode. The renderer calls `update()` each render and `pulse()` each ticker frame. Glow colors vary by theme (blue/cyan for primary, purple for secondary — endpoints of selected edges not in the primary selection).

### Edges

- **Edge endpoints** (`canvasEdge.ts`): An endpoint is either node-anchored (`nodeId` + proportional `anchor`) or a free-point (`x`, `y`). `resolveEndpoint` converts both forms to world coordinates using a `nodeMap`.
- **Edge waypoints** (`canvasEdge.ts`, `edgeHandleOverlay.ts`, `edgeReconciler.ts`): Edges support optional `waypoints` — an array of `{x, y}` coordinates that create polyline paths routing through intermediate points. Rendering builds a point array `[from, ...waypoints, to]` via `buildPolylinePoints`. Solid lines draw a single polyline; dashed/dotted styles iterate per segment. Arrowheads use the first/last segment direction. Labels sit at the arc-length midpoint via `computePolylineMidpoint`. Hit-testing uses `PolylineHitArea` which checks point-to-segment distance across all segments plus an optional `labelRect` (set by the renderer from the DOM label’s measured size, so clicking on a label that extends beyond the line still registers as an edge click). Ctrl+double-click on an edge segment inserts a waypoint; Ctrl+double-click on a waypoint handle removes it; dragging a waypoint onto a from/to endpoint also removes it.
- **Edge labels** (`canvasEdge.ts`, `domLabels.ts`, `labelEditor.ts`): Edges support optional labels rendered as DOM divs at the polyline midpoint. Double-click an edge to edit its label. In edit mode, selected edges show a blue dashed overlay; in locked mode, selected edges show a glow effect behind the line.
- **Edge creation** (`edgeMode.ts`): Toggle via toolbar button. Two-click workflow: first click sets source endpoint, second click creates the edge. Preview line + cursor dot follow the mouse. ESC exits edge mode.
- **Edge utilities** (`edgeUtils.ts`): Shared helpers extracted from `edgeMode.ts` — `findNodeAtPoint`, `computeAnchor`, `buildEndpoint`. Snap-before-hit-test: coordinates are grid-snapped before node hit-testing so the visual dot color always matches the snapped position.
- **Edge handle overlay** (`edgeHandleOverlay.ts`): When exactly one edge is selected (not locked, not in edge mode), shows draggable dot handles at from/to endpoints and at each waypoint. Red = node-anchored, blue = free-point/waypoint. During drag, exposes `getEndpointOverride()` and `getWaypointOverrides()` so `renderEdges` draws the edge at the in-flight position. Waypoint handles use a pooled array (`ensureWaypointHandles`) that grows as needed. Ctrl+double-click timing is stored on the handle object (`_lastCtrlClickTime`) to survive listener re-setup across renders. Dragging a waypoint onto a from/to endpoint removes it (merge). `insertWaypoint(edgeId, segmentIndex, point)` is called from the renderer on Ctrl+double-click-on-segment.

### Selection & Interaction

- **Multi-select** (`canvasNode.ts`): Shift+click toggles nodes in/out of selection. Multi-drag uses absolute positioning from recorded start positions to avoid delta accumulation drift. A `groupDraggingIds` set prevents re-renders from resetting companion nodes mid-drag.
- **Selection box** (`selectionBox.ts`): Shift+drag on empty space draws a rubber-band box. Nodes are selected on overlap (not full containment). Drag-select unions with existing selection; click on empty space without Shift clears selection. In locked mode, deselection is deferred to pointerup so drag-to-pan preserves the current selection.
- **Selection overlay** (`selectionOverlay.ts`): In edit mode, draws a dashed bounding box around selected nodes with 8 resize handles. Single-node selection shows resize handles for direct move/resize; multi-node selection shows individual dashed outlines per node but no resize handles. Handles and stroke scale inversely with viewport zoom to maintain consistent visual size. Fires `onDragUpdate` during resize so edges follow live. In locked mode the overlay is unused — selection glows are shown instead (see Lock mode).
- **Cursor management** (`cursorManager.ts`): Simple priority-based cursor stack so pan (grab/grabbing) and selection (crosshair) cues don’t fight.

### Editing

- **Label editing** (`labelEditor.ts`): Overlays an HTML `<textarea>` at the element’s screen position on double-click, scaled with viewport zoom. Hides the DOM label during editing and restores it on commit/cancel. Works for both nodes (`startLabelEdit`) and edges (`startEdgeLabelEdit`). Enter commits, Shift+Enter inserts a newline, Escape cancels, blur commits.
- **Node grouping** (`state.ts`, `canvasNode.ts`, `groupStatus.ts`): Any node can be a parent via `parentId`. Drag a node onto another to group; drag off to ungroup. Parent nodes render at lower z-index (depth-based). Dragging a parent cascades movement to all descendants. Deleting a parent orphans children (clears their `parentId`). Copy/paste preserves group relationships within the clipboard set. Status bar shows current group and a clickable "Remove" link.
- **Copy/paste** (`keyboard.ts`): Ctrl+C snapshots selected nodes plus all descendants; Ctrl+V pastes with new IDs, +20,+20 offset, and remapped `parentId` references. Only root pasted nodes are selected. Repeated paste cascades diagonally.
- **Delete** (`keyboard.ts`): Delete/Backspace removes selected nodes.
- **Snap to grid** (`gridSnap.ts`): Optional grid snapping (20px) applied during drag and resize. Toggled via toolbar button.

### Navigation

- **Lock mode** (`lockToggle.ts`, `canvasNode.ts`, `canvasEdge.ts`, `renderer.ts`, `selectionGlow.ts`, `panZoom.ts`): Toggles editing off — hides sidebar, disables dragging/resize/delete. All nodes and edges remain clickable for selection. Click (no drag) selects a node and highlights its connected edges, or selects an edge and highlights its connected nodes. Selection is shown as a glow effect (concentric semi-transparent rounded rects behind nodes; layered semi-transparent strokes behind edges) rather than dashed outlines. Click+drag pans the canvas even when starting on a node (panZoom accepts any target in locked mode); the click only registers if the pointer doesn’t move (Windows-button pattern). Double-click on a linked node/edge opens its file link.
- **File linking** (`schema.ts`, `extension.ts`, `canvasNode.ts`, `canvasEdge.ts`): Nodes and edges support an optional `fileLink` (`{ path, match? }`) that references a workspace file or URL. Right-click in any editor → "Link to Perspective Node" sets the link via a QuickPick that lists both nodes and edges. Edges without a label display as "from label → to label". Linked nodes/edges show a pointer cursor; hovering shows a tooltip with the path and "(Double-click)". In edit mode, Ctrl+Click opens the file and jumps to the matched text. In locked mode, double-click on a linked item opens the file; a plain click selects and highlights connections. The `openFileLink` message flows from webview → extension, which resolves the relative path and opens the document. Right-click a node/edge in edit mode shows "Set File Link" (or "Edit File Link" if one exists); this sends an `editFileLink` message to the extension which shows a QuickPick with workspace files, a URL entry option, and (if a link exists) a remove option, followed by an optional match text InputBox; the result flows back via `fileLinkResult`. Right-click ignores double-click timing to prevent accidental file-link opens.
