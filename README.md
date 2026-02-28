# VS Code Perspective

A code diagramming tool for VS Code optimized for navigating your codebase.

Open it in a side panel, map out subsets of your code as visual diagrams, then pan and zoom around like a canvas. Click any node to open the linked code in an adjacent panel — the graph stays in view so you always have your bearings. It's a spatial index for the parts of your codebase that matter most to you.

## Why

Code is easier to reason about when you can see it laid out spatially. Perspective lets you create focused diagrams of the subsystems, flows, or modules you care about, and then use those diagrams as a navigation tool — click a node and you're in the code.

## Features

- **File linking** — Right-click in any editor → "Link to Perspective Node" to connect a node or edge to a file, function, or code snippet. Ctrl+Click to jump there instantly.
- **Function highlighting** — Linked nodes and their connections glow so you can see what's mapped at a glance.
- **Adjacent panel navigation** — Clicking a linked node opens the code next to the diagram, keeping the graph in view.
- **View & edit modes** — Lock the diagram into view mode for pure navigation, or unlock it to rearrange and edit.
- **Pan & zoom** — Scroll to zoom, drag to pan. Labels stay crisp at any zoom level.
- **Shapes & colors** — 13 node shapes, fill/label colors, styled edges with arrows and waypoints.
- **Node grouping** — Drag nodes onto each other to create parent-child hierarchies.
- **Snap to grid** — Optional grid snapping for tidy layouts.
- **Space theme** — A built-in theme that thins out the diagram, reducing node and edge overlap. Looks great in dark mode.

## Performance

Diagrams render on a PixiJS/WebGL canvas, so panning, zooming, and dragging stay smooth even with large numbers of nodes and edges. Text labels are rendered as native DOM elements overlaid on the canvas — this keeps text crisp and fully legible at any zoom level, even when nodes are tiny. (PixiJS rasterizes text to textures, which gets fuzzy when scaled down; DOM text uses the browser's own font rendering with full hinting and subpixel antialiasing.)

## AI-Optimized Format

Perspective has no auto-layout engine — and that's by design. The `.vscp` file format is simple, flat JSON with an explicit structure: node positions, sizes, colors, shapes, and edge connections are all defined directly — no graph language to compile, no layout hints to interpret. This makes it easy for AI to read and write. Just describe what you want (e.g. "lay out a service diagram with auth at the top and database at the bottom") and let AI generate the `.vscp` file. AI tends to produce more meaningful spatial arrangements than algorithmic auto-layout because it understands the semantic relationships between your components and can place things where they make sense.

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
