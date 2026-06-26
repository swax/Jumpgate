import { describe, it, expect } from "vitest";
import {
  boundsSchema,
  nodeSchema,
  edgeEndpointSchema,
  edgeSchema,
  documentSchema,
  shapeValues,
  directionValues,
} from "./schema";

// ---------------------------------------------------------------------------
// boundsSchema
// ---------------------------------------------------------------------------
describe("boundsSchema", () => {
  it("accepts valid bounds", () => {
    const result = boundsSchema.safeParse({
      x: 0,
      y: -5,
      width: 100,
      height: 200,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ x: 0, y: -5, width: 100, height: 200 });
    }
  });

  it("accepts fractional positive width/height", () => {
    const result = boundsSchema.safeParse({
      x: 1,
      y: 2,
      width: 0.5,
      height: 0.001,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero width", () => {
    const result = boundsSchema.safeParse({ x: 0, y: 0, width: 0, height: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects zero height", () => {
    const result = boundsSchema.safeParse({ x: 0, y: 0, width: 10, height: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative width", () => {
    const result = boundsSchema.safeParse({
      x: 0,
      y: 0,
      width: -1,
      height: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative height", () => {
    const result = boundsSchema.safeParse({
      x: 0,
      y: 0,
      width: 10,
      height: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing x", () => {
    const result = boundsSchema.safeParse({ y: 0, width: 10, height: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects missing y", () => {
    const result = boundsSchema.safeParse({ x: 0, width: 10, height: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects missing width", () => {
    const result = boundsSchema.safeParse({ x: 0, y: 0, height: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects missing height", () => {
    const result = boundsSchema.safeParse({ x: 0, y: 0, width: 10 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const validBounds = { x: 10, y: 20, width: 100, height: 50 };

// ---------------------------------------------------------------------------
// nodeSchema
// ---------------------------------------------------------------------------
describe("nodeSchema", () => {
  it("accepts a minimal valid node (id + bounds only)", () => {
    const result = nodeSchema.safeParse({ id: "n1", bounds: validBounds });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("n1");
      expect(result.data.bounds).toEqual(validBounds);
    }
  });

  it("accepts a full node with all optional fields", () => {
    const full = {
      id: "n2",
      bounds: validBounds,
      nodeColor: "#ff0000",
      labelColor: "#00ff00",
      borderColor: "#0000ff",
      label: "My Node",
      fileLink: { path: "/some/file.ts", match: "functionName" },
      shape: "diamond" as const,
      direction: "left" as const,
      parentId: "n1",
    };
    const result = nodeSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(full);
    }
  });

  it("accepts every valid shape value", () => {
    for (const shape of shapeValues) {
      const result = nodeSchema.safeParse({
        id: "s",
        bounds: validBounds,
        shape,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts every valid direction value", () => {
    for (const direction of directionValues) {
      const result = nodeSchema.safeParse({
        id: "d",
        bounds: validBounds,
        direction,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid shape enum value", () => {
    const result = nodeSchema.safeParse({
      id: "n3",
      bounds: validBounds,
      shape: "hexagon",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid direction enum value", () => {
    const result = nodeSchema.safeParse({
      id: "n4",
      bounds: validBounds,
      direction: "northwest",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node with invalid bounds (zero width)", () => {
    const result = nodeSchema.safeParse({
      id: "n5",
      bounds: { x: 0, y: 0, width: 0, height: 10 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a node missing id", () => {
    const result = nodeSchema.safeParse({ bounds: validBounds });
    expect(result.success).toBe(false);
  });

  it("rejects a node missing bounds", () => {
    const result = nodeSchema.safeParse({ id: "n6" });
    expect(result.success).toBe(false);
  });

  it("accepts a fileLink with only path (match optional)", () => {
    const result = nodeSchema.safeParse({
      id: "n7",
      bounds: validBounds,
      fileLink: { path: "/file.ts" },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// edgeEndpointSchema
// ---------------------------------------------------------------------------
describe("edgeEndpointSchema", () => {
  it("accepts a node-anchored endpoint with anchor", () => {
    const result = edgeEndpointSchema.safeParse({
      nodeId: "n1",
      anchor: [80, 50],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ nodeId: "n1", anchor: [80, 50] });
    }
  });

  it("accepts a node-anchored endpoint without anchor", () => {
    const result = edgeEndpointSchema.safeParse({ nodeId: "n1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ nodeId: "n1" });
    }
  });

  it("accepts a free-point endpoint", () => {
    const result = edgeEndpointSchema.safeParse({ x: 100, y: 200 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ x: 100, y: 200 });
    }
  });

  it("rejects an object missing both nodeId and x/y", () => {
    const result = edgeEndpointSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a free-point with only x (missing y)", () => {
    const result = edgeEndpointSchema.safeParse({ x: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects an anchor with wrong tuple length", () => {
    const result = edgeEndpointSchema.safeParse({
      nodeId: "n1",
      anchor: [0.5],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an anchor with non-number elements", () => {
    const result = edgeEndpointSchema.safeParse({
      nodeId: "n1",
      anchor: ["a", "b"],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// edgeSchema
// ---------------------------------------------------------------------------
describe("edgeSchema", () => {
  const minimalEdge = {
    id: "e1",
    from: { nodeId: "n1" },
    to: { nodeId: "n2" },
  };

  it("accepts a minimal edge (id + from + to)", () => {
    const result = edgeSchema.safeParse(minimalEdge);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("e1");
    }
  });

  it("accepts a full edge with all optional fields", () => {
    const full = {
      id: "e2",
      from: { nodeId: "n1", anchor: [0, 25] },
      to: { x: 300, y: 400 },
      waypoints: [
        { x: 150, y: 200 },
        { x: 200, y: 300 },
      ],
      label: "connects",
      color: "#aabbcc",
      labelColor: "#112233",
      style: "dashed" as const,
      arrow: "both" as const,
      width: 4,
      opacity: 0.5,
      curve: "smooth" as const,
      fileLink: { path: "/link.ts" },
    };
    const result = edgeSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(full);
    }
  });

  it("accepts all valid style enum values", () => {
    for (const style of ["solid", "dashed", "dotted"]) {
      const result = edgeSchema.safeParse({ ...minimalEdge, style });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid arrow enum values", () => {
    for (const arrow of ["none", "end", "start", "both"]) {
      const result = edgeSchema.safeParse({ ...minimalEdge, arrow });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid style enum value", () => {
    const result = edgeSchema.safeParse({ ...minimalEdge, style: "wavy" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid arrow enum value", () => {
    const result = edgeSchema.safeParse({ ...minimalEdge, arrow: "double" });
    expect(result.success).toBe(false);
  });

  it("accepts opacity at the 0 and 1 bounds", () => {
    for (const opacity of [0, 0.5, 1]) {
      expect(edgeSchema.safeParse({ ...minimalEdge, opacity }).success).toBe(true);
    }
  });

  it("rejects opacity outside 0–1", () => {
    expect(edgeSchema.safeParse({ ...minimalEdge, opacity: 1.5 }).success).toBe(false);
    expect(edgeSchema.safeParse({ ...minimalEdge, opacity: -0.1 }).success).toBe(false);
  });

  it("rejects non-positive width", () => {
    expect(edgeSchema.safeParse({ ...minimalEdge, width: 0 }).success).toBe(false);
    expect(edgeSchema.safeParse({ ...minimalEdge, width: -2 }).success).toBe(false);
  });

  it("accepts both curve enum values and rejects others", () => {
    expect(edgeSchema.safeParse({ ...minimalEdge, curve: "straight" }).success).toBe(true);
    expect(edgeSchema.safeParse({ ...minimalEdge, curve: "smooth" }).success).toBe(true);
    expect(edgeSchema.safeParse({ ...minimalEdge, curve: "wavy" }).success).toBe(false);
  });

  it("accepts empty waypoints array", () => {
    const result = edgeSchema.safeParse({ ...minimalEdge, waypoints: [] });
    expect(result.success).toBe(true);
  });

  it("rejects waypoints with missing y coordinate", () => {
    const result = edgeSchema.safeParse({
      ...minimalEdge,
      waypoints: [{ x: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge missing id", () => {
    const result = edgeSchema.safeParse({
      from: { nodeId: "n1" },
      to: { nodeId: "n2" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an edge missing from", () => {
    const result = edgeSchema.safeParse({ id: "e3", to: { nodeId: "n2" } });
    expect(result.success).toBe(false);
  });

  it("rejects an edge missing to", () => {
    const result = edgeSchema.safeParse({ id: "e3", from: { nodeId: "n1" } });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// documentSchema
// ---------------------------------------------------------------------------
describe("documentSchema", () => {
  it("accepts a document with only an empty nodes array", () => {
    const result = documentSchema.safeParse({ nodes: [] });
    expect(result.success).toBe(true);
  });

  it("defaults edges to [] when omitted", () => {
    const result = documentSchema.safeParse({ nodes: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.edges).toEqual([]);
    }
  });

  it("accepts a full document with nodes, edges, and theme", () => {
    const doc = {
      nodes: [{ id: "n1", bounds: validBounds }],
      edges: [
        {
          id: "e1",
          from: { nodeId: "n1" },
          to: { x: 50, y: 50 },
        },
      ],
      theme: "space" as const,
    };
    const result = documentSchema.safeParse(doc);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.edges).toHaveLength(1);
      expect(result.data.theme).toBe("space");
    }
  });

  it("accepts both valid theme values", () => {
    for (const theme of ["standard", "space"]) {
      const result = documentSchema.safeParse({ nodes: [], theme });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid theme value", () => {
    const result = documentSchema.safeParse({ nodes: [], theme: "dark" });
    expect(result.success).toBe(false);
  });

  it("rejects a document missing nodes", () => {
    const result = documentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a document with an invalid node inside nodes array", () => {
    const result = documentSchema.safeParse({
      nodes: [{ id: "bad-node" }], // missing bounds
    });
    expect(result.success).toBe(false);
  });

  it("rejects a document with an invalid edge inside edges array", () => {
    const result = documentSchema.safeParse({
      nodes: [],
      edges: [{ id: "bad-edge" }], // missing from/to
    });
    expect(result.success).toBe(false);
  });

  it("roundtrip: parse then re-validate produces identical data", () => {
    const input = {
      nodes: [
        {
          id: "n1",
          bounds: { x: 0, y: 0, width: 120, height: 60 },
          label: "Start",
          shape: "ellipse" as const,
        },
        {
          id: "n2",
          bounds: { x: 200, y: 100, width: 120, height: 60 },
          label: "End",
          shape: "rectangle" as const,
          direction: "right" as const,
        },
      ],
      edges: [
        {
          id: "e1",
          from: { nodeId: "n1", anchor: [120, 30] },
          to: { nodeId: "n2", anchor: [0, 30] },
          label: "flow",
          style: "dashed" as const,
          arrow: "end" as const,
        },
      ],
      theme: "standard" as const,
    };

    const firstParse = documentSchema.parse(input);
    const secondParse = documentSchema.parse(firstParse);
    expect(secondParse).toEqual(firstParse);
  });
});
