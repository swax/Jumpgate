# Skill: Generate VS Code Perspective Diagrams (.vscp)

You are generating a `.vscp` file for **VS Code Perspective**, a code diagramming extension. The file is plain JSON that the editor renders as an interactive canvas with nodes, edges, labels, and colors.

Read this entire document before generating. The user will describe what they want — a system architecture, a flowchart, a dependency graph, etc. Your job is to produce valid `.vscp` JSON that looks good when opened.

---

## Document Structure

```jsonc
{
  "nodes": [ /* required, array of node objects */ ],
  "edges": [ /* optional, array of edge objects */ ],
  "theme": "standard" // optional: "standard" (default) or "space"
}
```

- `"space"` theme: dark background with starfield and glow effects — good for dark mode presentations.
- `"standard"` theme: clean default, works in both light and dark VS Code themes.

---

## Nodes

Every node requires `id` and `bounds`. All other fields are optional.

```jsonc
{
  "id": "unique-string",       // unique identifier (use descriptive slugs like "auth-service")
  "bounds": {
    "x": 100,                  // left edge, in pixels
    "y": 200,                  // top edge, in pixels
    "width": 180,              // must be > 0
    "height": 60               // must be > 0
  },
  "label": "Auth Service",     // display text (supports \n for multiline)
  "nodeColor": "#4CAF50",      // fill color (hex string)
  "labelColor": "#ffffff",     // text color (hex string)
  "borderColor": "#388E3C",    // stroke color (hex string, optional)
  "shape": "rounded-rectangle",// see shape list below
  "direction": "right",        // rotation: "up" (default), "right", "down", "left"
  "parentId": "group-node-id", // groups this node under another node (see Grouping)
  "fileLink": {                // optional link to a workspace file or URL
    "path": "src/auth.ts",     // relative workspace path or full URL (https://...)
    "match": "class AuthService" // optional text to jump to within the file
  }
}
```

### Shapes (13 total)

| Shape | Best for |
|---|---|
| `"rectangle"` | Default, general purpose |
| `"rounded-rectangle"` | Services, functions, classes |
| `"ellipse"` | Start/end states, events |
| `"diamond"` | Decision points, conditions |
| `"parallelogram"` | Input/output, data flow |
| `"trapezoid"` | Transformations, adapters |
| `"triangle"` | Warnings, hierarchy roots |
| `"cylinder"` | Databases, storage |
| `"pill"` | Tags, badges, status indicators |
| `"half-ellipse"` | Decorative, cloud-like |
| `"half-pill"` | Decorative variant |
| `"document"` | Documents, files, pages |
| `"text"` | Floating labels / titles (no fill, no border, text only) |

### Direction

Rotates applicable shapes (triangle, trapezoid, half-ellipse, half-pill, parallelogram, document). The default is `"up"` and can be omitted. Values: `"up"`, `"right"`, `"down"`, `"left"`.

### Grouping (Parent-Child)

Set `parentId` on a child node to group it inside a parent node. The parent node should have bounds large enough to visually contain its children. Children render above parents. This is useful for:
- Grouping functions under a module/class
- Grouping services under a system boundary
- Creating labeled regions

```jsonc
// Parent node (the background region)
{ "id": "grp-backend", "bounds": { "x": 0, "y": 0, "width": 500, "height": 300 },
  "nodeColor": "#263238", "borderColor": "#546E7A", "label": "Backend Services" },

// Child nodes inside it
{ "id": "auth", "bounds": { "x": 20, "y": 50, "width": 150, "height": 50 },
  "label": "Auth", "parentId": "grp-backend", "shape": "rounded-rectangle" },
{ "id": "api", "bounds": { "x": 200, "y": 50, "width": 150, "height": 50 },
  "label": "API Gateway", "parentId": "grp-backend", "shape": "rounded-rectangle" }
```

---

## Edges

Every edge requires `id`, `from`, and `to`. All other fields are optional.

```jsonc
{
  "id": "unique-edge-id",
  "from": { /* endpoint */ },
  "to": { /* endpoint */ },
  "label": "calls",            // optional text at midpoint of edge
  "color": "#ff6600",          // optional edge line color (hex)
  "labelColor": "#333333",     // optional edge label text color (hex)
  "style": "solid",            // "solid" (default), "dashed", "dotted"
  "arrow": "end",              // "none" (default), "end", "start", "both"
  "waypoints": [               // optional intermediate points for routing
    { "x": 300, "y": 150 }
  ],
  "fileLink": {                // optional, same format as node fileLink
    "path": "src/routes.ts",
    "match": "app.get"
  }
}
```

### Endpoints

An endpoint is either **node-anchored** or a **free point**:

**Node-anchored** (preferred — edge connects to a node):
```jsonc
{ "nodeId": "auth-service", "anchor": [0.5, 0] }
```
- `nodeId`: the `id` of the target node
- `anchor`: `[proportionalX, proportionalY]` — position on the node's bounding box
  - `[0, 0]` = top-left, `[1, 1]` = bottom-right
  - `[0.5, 0]` = top-center, `[1, 0.5]` = right-center
  - `[0.5, 1]` = bottom-center, `[0, 0.5]` = left-center
  - Can be omitted; if omitted the app picks a default anchor

**Free point** (edge ends in empty space):
```jsonc
{ "x": 500, "y": 200 }
```

### Common Anchor Patterns

For clean diagrams, connect edges to the nearest sides of the nodes:

```
Top-to-bottom flow:    from anchor [0.5, 1]  → to anchor [0.5, 0]
Left-to-right flow:    from anchor [1, 0.5]  → to anchor [0, 0.5]
Right-to-left flow:    from anchor [0, 0.5]  → to anchor [1, 0.5]
Bottom-to-top flow:    from anchor [0.5, 0]  → to anchor [0.5, 1]
```

### Waypoints

Waypoints create polyline routing — the edge goes through each waypoint in order. Use them to:
- Route edges around nodes they would otherwise cross
- Create L-shaped or Z-shaped connections
- Make complex layouts more readable

```jsonc
{
  "id": "e1",
  "from": { "nodeId": "a", "anchor": [1, 0.5] },
  "to": { "nodeId": "b", "anchor": [0, 0.5] },
  "waypoints": [
    { "x": 350, "y": 100 },
    { "x": 350, "y": 250 }
  ],
  "arrow": "end"
}
```

---

## Layout Guidelines

These are critical for producing good-looking diagrams:

### Spacing
- **Minimum gap between nodes**: 40px (20px feels cramped)
- **Comfortable gap**: 60–100px
- **Vertical spacing between rows**: 80–120px
- **Horizontal spacing between columns**: 80–120px

### Sizing
- **Typical small node**: 120×40 to 150×50
- **Typical medium node**: 160×50 to 200×60
- **Large nodes / group parents**: 300×200 or larger as needed
- **Title text nodes**: 300×40 to 500×50, shape `"text"`
- **Minimum readable size**: 80×30
- **Label sizing**: Each character is roughly 10×10px. Use this to estimate node widths (e.g. a 12-character label needs ~120px width).
- **Snap-to-grid**: The grid size is 10px. Size and position all node bounds and edge waypoints/free-points at multiples of 10 so they align cleanly when snap-to-grid is enabled.

### Coordinate System
- Origin (0, 0) is the top-left of the canvas
- X increases rightward, Y increases downward
- Negative coordinates are valid (useful for titles above the main diagram)
- The canvas supports panning and zooming, so absolute position matters less than relative layout

### Layout Patterns

**Top-down hierarchy** (org charts, call graphs):
- Place root nodes at top, children below
- Use anchors: from `[0.5, 1]` → to `[0.5, 0]`

**Left-to-right flow** (pipelines, data flow):
- Place source on left, sink on right
- Use anchors: from `[1, 0.5]` → to `[0, 0.5]`

**Clustered groups** (microservices, modules):
- Create a large parent node as background
- Place child nodes inside with `parentId`
- Use a muted/dark `nodeColor` for the parent, brighter colors for children

**Grid layout** (feature comparison, status boards):
- Align nodes to a regular grid (multiples of 10 work well with snap-to-grid)

### Color Suggestions

Use color meaningfully — group related concepts or indicate status:

| Purpose | Fill | Label | Example |
|---|---|---|---|
| Primary/active | `#1976D2` | `#ffffff` | Main services |
| Success/healthy | `#43A047` | `#ffffff` | Running systems |
| Warning | `#FF9800` | `#000000` | Degraded |
| Error/critical | `#E53935` | `#ffffff` | Failures |
| Neutral/info | `#f2f2f2` | `#000000` | Default nodes |
| Dark background (group) | `#263238` | `#B0BEC5` | Group containers |
| Muted secondary | `#78909C` | `#ffffff` | Supporting pieces |

For edge colors, match or complement the source/target node colors.

---

## Complete Example

A small service architecture diagram:

```json
{
  "theme": "standard",
  "nodes": [
    {
      "id": "title",
      "bounds": { "x": 80, "y": -40, "width": 300, "height": 40 },
      "label": "Order Processing System",
      "shape": "text"
    },
    {
      "id": "client",
      "bounds": { "x": 0, "y": 40, "width": 160, "height": 50 },
      "nodeColor": "#1976D2",
      "labelColor": "#ffffff",
      "label": "Web Client",
      "shape": "rounded-rectangle"
    },
    {
      "id": "api",
      "bounds": { "x": 240, "y": 40, "width": 160, "height": 50 },
      "nodeColor": "#43A047",
      "labelColor": "#ffffff",
      "label": "API Gateway",
      "shape": "rounded-rectangle"
    },
    {
      "id": "orders",
      "bounds": { "x": 160, "y": 160, "width": 160, "height": 50 },
      "nodeColor": "#FF9800",
      "labelColor": "#000000",
      "label": "Order Service",
      "shape": "rounded-rectangle"
    },
    {
      "id": "db",
      "bounds": { "x": 160, "y": 280, "width": 160, "height": 60 },
      "nodeColor": "#78909C",
      "labelColor": "#ffffff",
      "label": "PostgreSQL",
      "shape": "cylinder"
    }
  ],
  "edges": [
    {
      "id": "e-client-api",
      "from": { "nodeId": "client", "anchor": [1, 0.5] },
      "to": { "nodeId": "api", "anchor": [0, 0.5] },
      "label": "REST",
      "arrow": "end"
    },
    {
      "id": "e-api-orders",
      "from": { "nodeId": "api", "anchor": [0.5, 1] },
      "to": { "nodeId": "orders", "anchor": [0.5, 0] },
      "label": "gRPC",
      "arrow": "end"
    },
    {
      "id": "e-orders-db",
      "from": { "nodeId": "orders", "anchor": [0.5, 1] },
      "to": { "nodeId": "db", "anchor": [0.5, 0] },
      "label": "queries",
      "style": "dashed",
      "arrow": "end"
    }
  ]
}
```

---

## Checklist Before Outputting

1. Every `id` is unique across all nodes and edges
2. Every `nodeId` in edge endpoints references an existing node `id`
3. All `bounds` have positive `width` and `height`
4. Nodes don't overlap (unless intentional parent-child grouping)
5. Edges connect to logical sides of nodes (anchors match the visual flow direction)
6. Colors are valid hex strings (e.g. `"#FF9800"`, `"#ffffff"`)
7. The JSON is valid (no trailing commas, no comments)
8. If `parentId` is used, the parent node exists and is large enough to contain children
9. Layout has enough spacing to be readable (40px minimum between unrelated nodes)
10. The output is a raw JSON object — no markdown fences, no explanation, just the `.vscp` content
