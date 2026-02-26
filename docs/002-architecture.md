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
  schema.ts               Zod schemas (nodeSchema, edgeSchema, fileLinkSchema, documentSchema) + types; nodeSchema includes optional shape (enum), direction ("up"|"right"|"down"|"left", omitted when "up"), and parentId (string, for node grouping); edgeSchema includes optional label, color, labelColor, style, arrow, and fileLink
  messages.ts             Typed message protocol (extension ↔ webview) — includes openFileLink
  vscpEditorProvider.ts   CustomTextEditorProvider — HTML shell, CSP, two-way messaging, openFileLink handler
  webview/
    main.ts               Entry point — PixiJS Application, viewport container, message wiring
    state.ts              Pub/sub store (EditorState: document + selectedNodeIds[] + selectedEdgeIds[] + edgeMode + locked + snapToGrid)
    renderer.ts           Reconciles PixiJS containers against state, manages selection + edge handle overlays
    globals.d.ts          acquireVsCodeApi type declaration
    canvas/
      canvasNode.ts       Node container factory (shape Graphics + Text label) + drag/click/dblclick handlers
      shapeDrawing.ts     Centralized drawShape() + directionToDeg() — 12 shape types, direction-based orientation within bounding box
      canvasEdge.ts       Edge container factory (Graphics "edge-line" + Text "edge-label") + line/arrowhead rendering + endpoint resolution + double-click label editing
      edgeUtils.ts        Shared edge utilities: findNodeAtPoint (with optional excludeIds), computeAnchor, buildEndpoint, dot constants
      selectionOverlay.ts Dashed bounding box + 8 resize handles for selected nodes
      edgeHandleOverlay.ts Draggable endpoint handles on selected edges — drag to reposition from/to
    controls/
      lockToggle.ts       Lock button UI — toggles editing, hides sidebar, disables interactions
      gridSnap.ts         Snap-to-grid toggle button and snap() utility (GRID_SIZE = 20)
      sidebar.ts          Sidebar controls for fill color, label color, shape dropdown, and direction rotate button — works for both nodes (nodeColor/labelColor) and edges (color/labelColor); shape and rotate disabled for edges
    interactions/
      panZoom.ts          Viewport panning and mouse-wheel zoom-to-cursor
      keyboard.ts         Keyboard shortcuts (Delete, Ctrl+C/V) and clipboard state — copy/paste includes descendants
      edgeMode.ts         Edge creation mode — toolbar toggle, two-click workflow, preview line + cursor dot
      groupStatus.ts      Group status bar — shows parent info on selection, drag-to-group messages, remove-from-group link
      labelEditor.ts      DOM textarea overlay for inline label editing on double-click (nodes and edges); Enter commits, Shift+Enter for newline, Escape cancels
      selectionBox.ts     Shift+drag rubber-band selection box + click-off deselect
      cursorManager.ts    Centralized cursor priority manager (pan/select)
```

## Container Hierarchy

```
app.stage                         (background click-to-deselect)
  └─ viewport                     (sortableChildren — pan/zoom transform)
      ├─ edge containers          (zIndex derived from connected nodes — see below)
      │   ├─ Graphics "edge-line" (line/arrows, eventMode: "static", owns hitArea)
      │   └─ Text "edge-label"   (centered at edge midpoint, stays horizontal)
      ├─ node containers          (zIndex depth-based, eventMode: "static")
      │   ├─ Graphics "node-rect" (shape graphic, optionally rotated via pivot)
      │   └─ Text "node-label"    (centered, word-wrapped, stays horizontal)
      ├─ SelectionOverlay         (zIndex 9000, eventMode: "passive")
      │   ├─ Graphics             (dashed outline)
      │   └─ Graphics × 8         (resize handles)
      └─ EdgeHandleOverlay        (zIndex 9001, eventMode: "passive")
          └─ Graphics × 2         (from/to endpoint handles)
```

Z-index layers (bottom to top): depth-0 nodes (1000+i), depth-0 text nodes (1500+i), depth-1 nodes (2000+i), depth-1 text nodes (2500+i), etc. Edges sit just below the higher of their two connected nodes (max node zIndex − 0.5). Dragged nodes temporarily boost to 8900+. Overlays at 9000+. Depth is determined by `parentId` ancestry chain — children render above parents.

## Build

Two esbuild bundles (`npm run build`):
- **Extension**: `src/extension.ts` → `dist/extension.js` (CJS, Node, vscode externalized)
- **Webview**: `src/webview/main.ts` → `dist/webview.js` (IIFE, browser, PixiJS bundled in)

## Key Patterns

- **Reconciliation** (`renderer.ts`): Diffs state against existing PixiJS containers by node ID — creates, updates, or destroys as needed. Skips nodes mid-drag to avoid fighting user input.
- **Selection overlay** (`selectionOverlay.ts`): Draws a dashed bounding box around selected nodes with 8 resize handles. Single-node resize moves/resizes directly; multi-node resize scales all nodes proportionally within the bounding box. Handles and stroke scale inversely with viewport zoom to maintain consistent visual size. Fires `onDragUpdate` during resize so edges follow live.
- **Edge handle overlay** (`edgeHandleOverlay.ts`): When exactly one edge is selected (not locked, not in edge mode), shows draggable dot handles at from/to endpoints. Red = node-anchored, blue = free-point. During drag, exposes `getEndpointOverride()` so `renderEdges` draws the edge at the in-flight position. Fires `onDragMove` each frame for live preview.
- **Edge utilities** (`edgeUtils.ts`): Shared helpers extracted from `edgeMode.ts` — `findNodeAtPoint`, `computeAnchor`, `buildEndpoint`. Snap-before-hit-test: coordinates are grid-snapped before node hit-testing so the visual dot color always matches the snapped position.
- **Echo guard** (`vscpEditorProvider.ts`): `isApplyingEdit` flag prevents `onDidChangeTextDocument` from echoing back edits the webview just made.
- **Debounced edits** (`main.ts`): Canvas changes are batched (100ms) before posting to the extension to avoid spamming WorkspaceEdits.
- **Pub/sub store** (`state.ts`): Simple reactive state — `EditorState` holds document, `selectedNodeIds[]`, `selectedEdgeIds[]`, edgeMode, locked, and snapToGrid flags. Subscribers (renderer) are notified on any change. `updateNodes()` batches multiple node changes into a single notify.
- **Multi-select** (`canvasNode.ts`): Shift+click toggles nodes in/out of selection. Multi-drag uses absolute positioning from recorded start positions to avoid delta accumulation drift. A `groupDraggingIds` set prevents re-renders from resetting companion nodes mid-drag.
- **Selection box** (`selectionBox.ts`): Shift+drag on empty space draws a rubber-band box. Nodes are selected on overlap (not full containment). Drag-select unions with existing selection; click on empty space without Shift clears selection.
- **Cursor management** (`cursorManager.ts`): Simple priority-based cursor stack so pan (grab/grabbing) and selection (crosshair) cues don’t fight.
- **Node grouping** (`state.ts`, `canvasNode.ts`, `groupStatus.ts`): Any node can be a parent via `parentId`. Drag a node onto another to group; drag off to ungroup. Parent nodes render at lower z-index (depth-based). Dragging a parent cascades movement to all descendants. Deleting a parent orphans children (clears their `parentId`). Copy/paste preserves group relationships within the clipboard set. Status bar shows current group and a clickable "Remove" link.
- **Copy/paste** (`keyboard.ts`): Ctrl+C snapshots selected nodes plus all descendants; Ctrl+V pastes with new IDs, +20,+20 offset, and remapped `parentId` references. Only root pasted nodes are selected. Repeated paste cascades diagonally.
- **Delete** (`keyboard.ts`): Delete/Backspace removes selected nodes.
- **Snap to grid** (`gridSnap.ts`): Optional grid snapping (20px) applied during drag and resize. Toggled via toolbar button.
- **Lock mode** (`lockToggle.ts`): Toggles all interactions off — deselects nodes, hides sidebar, disables dragging and transforms. Linked nodes remain clickable to follow file links.
- **Label editing** (`labelEditor.ts`): Overlays an HTML `<textarea>` at the element's screen position on double-click, scaled with viewport zoom. Works for both nodes (`startLabelEdit`) and edges (`startEdgeLabelEdit`). Enter commits, Shift+Enter inserts a newline, Escape cancels, blur commits.
- **Edge creation** (`edgeMode.ts`): Toggle via toolbar button. Two-click workflow: first click sets source endpoint, second click creates the edge. Preview line + cursor dot follow the mouse. ESC exits edge mode.
- **Edge labels** (`canvasEdge.ts`, `labelEditor.ts`): Edges support optional labels rendered as `PixiText` at the edge midpoint. Double-click an edge to edit its label. Selected edges show a blue dashed overlay rather than changing the edge color.
- **Edge endpoints** (`canvasEdge.ts`): An endpoint is either node-anchored (`nodeId` + proportional `anchor`) or a free-point (`x`, `y`). `resolveEndpoint` converts both forms to world coordinates using a `nodeMap`.
- **Live edge following** (`renderer.ts`): `buildNodeMap` always reads live container positions/sizes, so edges follow during both node drag (`onDragUpdate` from `canvasNode`) and node resize (`onDragUpdate` from `selectionOverlay`). During edge handle drags, `renderEdges` applies the overlay's endpoint override to draw the edge at the in-flight position.
- **File linking** (`schema.ts`, `extension.ts`, `canvasNode.ts`): Nodes and edges support an optional `fileLink` (`{ path, match? }`) that references a workspace file. Right-click in any editor → "Link to Perspective Node" sets the link via a QuickPick flow. Linked nodes/edges show a pointer cursor; hovering shows a tooltip with the path and "(Ctrl+Click)". Ctrl+Click opens the file and jumps to the matched text. In locked mode, a plain click follows the link. The `openFileLink` message flows from webview → extension, which resolves the relative path and opens the document.
