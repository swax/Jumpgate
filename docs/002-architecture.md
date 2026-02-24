# Architecture

VS Code custom editor extension for `.vscp` files. Renders an interactive Konva.js canvas where users can select, drag, and resize boxes. Changes sync bidirectionally with the underlying JSON document.

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
  schema.ts               Zod schemas (boxSchema, documentSchema) + types
  messages.ts             Typed message protocol (extension ↔ webview)
  vscpEditorProvider.ts   CustomTextEditorProvider — HTML shell, CSP, two-way messaging
  webview/
    globals.d.ts          acquireVsCodeApi type declaration
    main.ts               Entry point — Konva Stage/Layer/Transformer setup, message wiring
    state.ts              Pub/sub store (EditorState: document + selectedBoxId)
    renderer.ts           Reconciles Konva nodes against state, manages Transformer
```

## Build

Two esbuild bundles (`npm run build`):
- **Extension**: `src/extension.ts` → `dist/extension.js` (CJS, Node, vscode externalized)
- **Webview**: `src/webview/main.ts` → `dist/webview.js` (IIFE, browser, Konva bundled in)

## Key Patterns

- **Reconciliation** (`renderer.ts`): Diffs state against existing Konva nodes — creates, updates, or destroys as needed. Skips nodes mid-drag to avoid fighting user input.
- **Transformer**: Single shared `Konva.Transformer`; attached/detached based on `selectedBoxId`. On `transformend`, scale is applied to width/height then reset to 1.
- **Echo guard** (`vscpEditorProvider.ts`): `isApplyingEdit` flag prevents `onDidChangeTextDocument` from echoing back edits the webview just made.
- **Debounced edits** (`main.ts`): Canvas changes are batched (100ms) before posting to the extension to avoid spamming WorkspaceEdits.
