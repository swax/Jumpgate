# VS Code Perspective

A code diagramming tool for VS Code optimized for navigating your codebase.

Open it in a side panel, map out subsets of your code as visual diagrams, then pan and zoom around like a canvas. Click any node to open the linked code in an adjacent panel — the graph stays in view so you always have your bearings. It's a spatial index for the parts of your codebase that matter most to you.

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

## Usage

Create a `.vscp` file (it's JSON) and open it — the diagram editor appears automatically. Use the lock button in the toolbar to switch between view mode and edit mode.

### View Mode

- **Scroll** to zoom in and out toward the cursor.
- **Click+drag** anywhere to pan the canvas.
- **Click** a node or edge to select it and highlight its connections.
- **Double-click** a linked node or edge to open the file in a preview tab.
- **Middle-click** a linked node or edge to open the file in a new pinned tab.
- **Reset zoom** button resets pan and zoom to the default view.

### Edit Mode

**Nodes**
- **Double-click** a node to edit its label (Enter commits, Shift+Enter for newline, Escape cancels).
- **Drag** a node to move it. If multiple nodes are selected, they all move together.
- **Drag** a node onto another to group them (parent-child). The status bar shows the current group with a remove link.
- **Shift+click** to toggle a node in and out of the selection. **Shift+drag** on empty space for rubber-band multi-select.
- **Delete / Backspace** removes selected nodes and edges.
- **Ctrl+C / Ctrl+V** to copy and paste nodes (includes children, offsets +20px).
- Use the **sidebar** to change fill color, label color, border color, shape, and rotation.

**Edges**
- Toggle **edge mode** in the toolbar, then click a source and a target to create an edge. Escape exits edge mode.
- **Double-click** an edge to edit its label.
- **Ctrl+double-click** an edge segment to add a waypoint. Drag waypoint handles to reshape the path. Ctrl+double-click a waypoint to remove it.
- When an edge is selected, drag the **endpoint handles** to reattach or reposition.

**General**
- Right-click in any editor → **"Link to Perspective Node"** to connect a node or edge to a file or code snippet.
- Toggle **snap-to-grid** in the toolbar for aligned layouts (20px grid).
- Toggle the **theme** button to switch between Standard and Space themes.

## Performance

Diagrams render on a PixiJS/WebGL canvas, so panning, zooming, and dragging stay smooth even with large numbers of nodes and edges. Text labels are rendered as native DOM elements overlaid on the canvas — this keeps text crisp and fully legible at any zoom level, even when nodes are tiny. (PixiJS rasterizes text to textures, which gets fuzzy when scaled down; DOM text uses the browser's own font rendering with full hinting and subpixel antialiasing.)

## AI-Optimized Format

Perspective has no auto-layout engine — and that's by design. The `.vscp` file format is simple, flat JSON with an explicit structure: node positions, sizes, colors, shapes, and edge connections are all defined directly — no graph language to compile, no layout hints to interpret. This makes it easy for AI to read and write. Just describe what you want (e.g. "lay out a service diagram with auth at the top and database at the bottom") and let AI generate the `.vscp` file. AI tends to produce more meaningful spatial arrangements than algorithmic auto-layout because it understands the semantic relationships between your components and can place things where they make sense.

## Development

```sh
npm install
npm run build
```

Press F5 to launch the Extension Development Host.

## License

MIT
