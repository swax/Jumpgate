# Architecture

VS Code custom editor extension for `.vscp` files. Renders an interactive Konva.js canvas where users can select, drag, resize, color, and label nodes. Changes sync bidirectionally with the underlying JSON document.

## Data Flow

```
.vscp file (JSON on disk)
    ↕ Ctrl+S saves / Ctrl+Z undoes
In-memory TextDocument (VS Code)
    ↕ postMessage (update ↓, edit ↑)
Webview (Konva.js canvas)
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
    main.ts               Entry point — Konva Stage/Layer/Transformer setup, message wiring
    keyboard.ts           Keyboard shortcuts (Delete, Ctrl+C/V) and clipboard state
    state.ts              Pub/sub store (EditorState: document + selectedNodeIds[] + locked)
    renderer.ts           Reconciles Konva nodes against state, manages Transformer
    canvasNode.ts         Node group factory (Rect + Text) + drag/resize/click/dblclick handlers
    labelEditor.ts        DOM textarea overlay for inline label editing on double-click
    panZoom.ts            Canvas panning (stage.draggable) and mouse-wheel zoom
    lockToggle.ts         Lock button UI — toggles editing, hides sidebar, disables transforms
    sidebar.ts            Color picker controls for node fill and label color
```

## Build

Two esbuild bundles (`npm run build`):
- **Extension**: `src/extension.ts` → `dist/extension.js` (CJS, Node, vscode externalized)
- **Webview**: `src/webview/main.ts` → `dist/webview.js` (IIFE, browser, Konva bundled in)

## Key Patterns

- **Reconciliation** (`renderer.ts`): Diffs state against existing Konva nodes — creates, updates, or destroys as needed. Skips nodes mid-drag to avoid fighting user input.
- **Transformer**: Single shared `Konva.Transformer`; attached to all nodes in `selectedNodeIds[]` (supports multi-select). On `transformend`, scale is applied to width/height then reset to 1.
- **Echo guard** (`vscpEditorProvider.ts`): `isApplyingEdit` flag prevents `onDidChangeTextDocument` from echoing back edits the webview just made.
- **Debounced edits** (`main.ts`): Canvas changes are batched (100ms) before posting to the extension to avoid spamming WorkspaceEdits.
- **Pub/sub store** (`state.ts`): Simple reactive state — `EditorState` holds document, `selectedNodeIds[]`, and locked flag. Subscribers (renderer) are notified on any change. `updateNodes()` batches multiple node changes into a single notify.
- **Multi-select** (`canvasNode.ts`, `main.ts`): Shift+click toggles nodes in/out of selection. Multi-drag uses absolute positioning from recorded start positions to avoid delta accumulation drift. A `groupDraggingIds` set prevents re-renders from resetting companion nodes mid-drag.
- **Copy/paste** (`main.ts`): Ctrl+C snapshots selected nodes; Ctrl+V pastes with new IDs and +20,+20 offset. Repeated paste cascades diagonally.
- **Delete** (`main.ts`): Delete/Backspace removes selected nodes.
- **Lock mode** (`lockToggle.ts`): Toggles all interactions off — deselects nodes, hides sidebar, disables dragging and transforms.
