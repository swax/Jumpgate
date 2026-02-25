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
  extension.ts            Activation: registers VscpEditorProvider
  schema.ts               Zod schemas (nodeSchema, documentSchema) + types
  messages.ts             Typed message protocol (extension ↔ webview)
  vscpEditorProvider.ts   CustomTextEditorProvider — HTML shell, CSP, two-way messaging
  webview/
    globals.d.ts          acquireVsCodeApi type declaration
    main.ts               Entry point — PixiJS Application, viewport container, message wiring
    keyboard.ts           Keyboard shortcuts (Delete, Ctrl+C/V) and clipboard state
    state.ts              Pub/sub store (EditorState: document + selectedNodeIds[] + locked + snapToGrid)
    renderer.ts           Reconciles PixiJS containers against state, manages selection overlay
    canvasNode.ts         Node container factory (Graphics rect + Text label) + drag/click/dblclick handlers
    selectionOverlay.ts   Dashed bounding box + 8 resize handles for selected nodes
    labelEditor.ts        DOM textarea overlay for inline label editing on double-click
    panZoom.ts            Viewport panning and mouse-wheel zoom-to-cursor
    gridSnap.ts           Snap-to-grid toggle button and snap() utility (GRID_SIZE = 20)
    lockToggle.ts         Lock button UI — toggles editing, hides sidebar, disables interactions
    sidebar.ts            Color picker controls for node fill and label color
```

## Container Hierarchy

```
app.stage                         (background click-to-deselect)
  └─ viewport                     (Container — pan/zoom transform)
      ├─ node containers          (Container per node, eventMode: "static")
      │   ├─ Graphics "node-rect" (filled rectangle + stroke)
      │   └─ Text "node-label"    (centered, word-wrapped)
      └─ SelectionOverlay         (Container, eventMode: "passive")
          ├─ Graphics             (dashed outline)
          └─ Graphics × 8         (resize handles)
```

## Build

Two esbuild bundles (`npm run build`):
- **Extension**: `src/extension.ts` → `dist/extension.js` (CJS, Node, vscode externalized)
- **Webview**: `src/webview/main.ts` → `dist/webview.js` (IIFE, browser, PixiJS bundled in)

## Key Patterns

- **Reconciliation** (`renderer.ts`): Diffs state against existing PixiJS containers by node ID — creates, updates, or destroys as needed. Skips nodes mid-drag to avoid fighting user input.
- **Selection overlay** (`selectionOverlay.ts`): Draws a dashed bounding box around selected nodes with 8 resize handles. Single-node resize moves/resizes directly; multi-node resize scales all nodes proportionally within the bounding box. Handles and stroke scale inversely with viewport zoom to maintain consistent visual size.
- **Echo guard** (`vscpEditorProvider.ts`): `isApplyingEdit` flag prevents `onDidChangeTextDocument` from echoing back edits the webview just made.
- **Debounced edits** (`main.ts`): Canvas changes are batched (100ms) before posting to the extension to avoid spamming WorkspaceEdits.
- **Pub/sub store** (`state.ts`): Simple reactive state — `EditorState` holds document, `selectedNodeIds[]`, locked, and snapToGrid flags. Subscribers (renderer) are notified on any change. `updateNodes()` batches multiple node changes into a single notify.
- **Multi-select** (`canvasNode.ts`): Shift+click toggles nodes in/out of selection. Multi-drag uses absolute positioning from recorded start positions to avoid delta accumulation drift. A `groupDraggingIds` set prevents re-renders from resetting companion nodes mid-drag.
- **Copy/paste** (`keyboard.ts`): Ctrl+C snapshots selected nodes; Ctrl+V pastes with new IDs and +20,+20 offset. Repeated paste cascades diagonally.
- **Delete** (`keyboard.ts`): Delete/Backspace removes selected nodes.
- **Snap to grid** (`gridSnap.ts`): Optional grid snapping (20px) applied during drag and resize. Toggled via toolbar button.
- **Lock mode** (`lockToggle.ts`): Toggles all interactions off — deselects nodes, hides sidebar, disables dragging and transforms.
- **Label editing** (`labelEditor.ts`): Overlays an HTML `<textarea>` at the node's screen position on double-click, scaled with viewport zoom. Commits on blur/Enter, cancels on Escape.
