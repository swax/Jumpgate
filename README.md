# VS Code Perspective

A code diagramming tool for VS Code optimized for navigating your codebase.

Open it in a side panel, map out subsets of your code as visual diagrams, then Ctrl+Click any node to jump straight to the linked file or function. Pan and zoom around your diagrams like a canvas — it's a spatial index for the parts of your codebase that matter most to you.

## Why

Code is easier to reason about when you can see it laid out spatially. Perspective lets you create focused diagrams of the subsystems, flows, or modules you care about, and then use those diagrams as a navigation tool — click a node and you're in the code.

## Features

- **File linking** — Right-click in any editor → "Link to Perspective Node" to connect a node or edge to a source file. Ctrl+Click to jump there instantly.
- **Pan & zoom** — Scroll to zoom, drag to pan. Labels stay crisp at any zoom level.
- **Shapes & colors** — 13 node shapes, fill/label colors, styled edges with arrows and waypoints.
- **Node grouping** — Drag nodes onto each other to create parent-child hierarchies.
- **Lock mode** — Lock the diagram so clicks only follow file links — no accidental edits while navigating.
- **Snap to grid** — Optional grid snapping for tidy layouts.
- **Space theme** — A built-in theme that thins out the diagram, reducing node and edge overlap. Looks great in dark mode.

## Performance

Diagrams render on a PixiJS/WebGL canvas, so panning, zooming, and dragging stay smooth even with large numbers of nodes and edges. Text labels are rendered as native DOM elements overlaid on the canvas — this keeps text crisp and fully legible at any zoom level, even when nodes are tiny. (PixiJS rasterizes text to textures, which gets fuzzy when scaled down; DOM text uses the browser's own font rendering with full hinting and subpixel antialiasing.)

## AI-Generated Layouts

Perspective has no auto-layout engine — and that's by design. Instead, describe what you want to an AI (e.g. "lay out a service diagram with auth at the top and database at the bottom") and paste the generated `.vscp` JSON directly into the file. AI-generated layouts tend to produce more meaningful spatial arrangements than algorithmic auto-layout because they understand the semantic relationships between your components.

## Getting Started

1. Install the extension
2. Create a `.vscp` file (it's JSON)
3. Open it — the diagram editor appears automatically
4. Add nodes, connect them with edges, and link them to your source files

## Development

```sh
npm install
npm run build
```

Press F5 to launch the Extension Development Host.

## License

MIT
