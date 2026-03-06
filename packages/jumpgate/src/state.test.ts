import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Edge, Node, JgDocument } from "./schema";
import {
  getState,
  setDocument,
  setSelectedNodeIds,
  setSelectedEdgeIds,
  setSelection,
  toggleSelectedNodeId,
  addNodes,
  deleteNodes,
  addEdge,
  deleteEdges,
  updateEdge,
  updateNode,
  updateNodes,
  generateNodeId,
  generateEdgeId,
  getNodeById,
  getEdgeById,
  getConnectedEdgeIds,
  getConnectedNodeIds,
  getChildNodeIds,
  getDescendantIds,
  getNodeDepth,
  setLocked,
  setSnapToGrid,
  setDocumentTheme,
  subscribe,
  resetState,
} from "./state";

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    ...overrides,
  };
}

function makeEdge(id: string, fromNodeId: string, toNodeId: string, overrides: Partial<Edge> = {}): Edge {
  return {
    id,
    from: { nodeId: fromNodeId },
    to: { nodeId: toNodeId },
    ...overrides,
  };
}

function emptyDoc(): JgDocument {
  return { nodes: [], edges: [] };
}

describe("state", () => {
  beforeEach(() => {
    resetState();
    setDocument(emptyDoc());
  });

  describe("setDocument / getState", () => {
    it("sets document and resets state", () => {
      const doc: JgDocument = {
        nodes: [makeNode("node-1")],
        edges: [makeEdge("edge-1", "node-1", "node-1")],
      };
      setDocument(doc);
      const s = getState();
      expect(s.document.nodes).toHaveLength(1);
      expect(s.document.edges).toHaveLength(1);
      expect(s.selectedNodeIds).toEqual([]);
      expect(s.selectedEdgeIds).toEqual([]);
    });

    it("initializes ID tracking from existing nodes and edges", () => {
      const doc: JgDocument = {
        nodes: [makeNode("node-5"), makeNode("node-3")],
        edges: [makeEdge("edge-4", "node-5", "node-3")],
      };
      setDocument(doc);
      // Next generated node ID should be node-6 (max existing is 5)
      expect(generateNodeId()).toBe("node-6");
      // Next generated edge ID should be edge-5 (max existing is 4)
      expect(generateEdgeId()).toBe("edge-5");
    });
  });

  describe("generateNodeId / generateEdgeId", () => {
    it("generates sequential node IDs starting from node-1", () => {
      expect(generateNodeId()).toBe("node-1");
      expect(generateNodeId()).toBe("node-2");
      expect(generateNodeId()).toBe("node-3");
    });

    it("generates sequential edge IDs starting from edge-1", () => {
      expect(generateEdgeId()).toBe("edge-1");
      expect(generateEdgeId()).toBe("edge-2");
      expect(generateEdgeId()).toBe("edge-3");
    });

    it("skips already-used node IDs", () => {
      const doc: JgDocument = {
        nodes: [makeNode("node-1"), makeNode("node-2")],
        edges: [],
      };
      setDocument(doc);
      // node-1 and node-2 are used, so next should be node-3
      expect(generateNodeId()).toBe("node-3");
    });

    it("skips already-used edge IDs", () => {
      const doc: JgDocument = {
        nodes: [makeNode("node-1"), makeNode("node-2")],
        edges: [makeEdge("edge-1", "node-1", "node-2"), makeEdge("edge-2", "node-1", "node-2")],
      };
      setDocument(doc);
      expect(generateEdgeId()).toBe("edge-3");
    });

    it("continues from highest existing ID in document", () => {
      const doc: JgDocument = {
        nodes: [makeNode("node-10")],
        edges: [makeEdge("edge-7", "node-10", "node-10")],
      };
      setDocument(doc);
      expect(generateNodeId()).toBe("node-11");
      expect(generateEdgeId()).toBe("edge-8");
    });
  });

  describe("addNodes / deleteNodes", () => {
    it("appends nodes to document", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      expect(getState().document.nodes).toHaveLength(2);
      expect(getState().document.nodes[0].id).toBe("node-1");
      expect(getState().document.nodes[1].id).toBe("node-2");
    });

    it("deletes specified nodes", () => {
      addNodes([makeNode("node-1"), makeNode("node-2"), makeNode("node-3")]);
      deleteNodes(["node-2"]);
      const ids = getState().document.nodes.map((n) => n.id);
      expect(ids).toEqual(["node-1", "node-3"]);
    });

    it("removes connected edges when a node is deleted (from side)", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      deleteNodes(["node-1"]);
      expect(getState().document.edges).toHaveLength(0);
    });

    it("removes connected edges when a node is deleted (to side)", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      deleteNodes(["node-2"]);
      expect(getState().document.edges).toHaveLength(0);
    });

    it("clears parentId from children when parent is deleted", () => {
      addNodes([makeNode("node-1"), makeNode("node-2", { parentId: "node-1" })]);
      deleteNodes(["node-1"]);
      const remaining = getState().document.nodes;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("node-2");
      expect(remaining[0].parentId).toBeUndefined();
    });

    it("removes deleted node from selectedNodeIds", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      setSelectedNodeIds(["node-1", "node-2"]);
      deleteNodes(["node-1"]);
      expect(getState().selectedNodeIds).toEqual(["node-2"]);
    });
  });

  describe("addEdge / deleteEdges / updateEdge", () => {
    it("adds an edge to the document", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      expect(getState().document.edges).toHaveLength(1);
      expect(getState().document.edges[0].id).toBe("edge-1");
    });

    it("deletes specified edges", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      addEdge(makeEdge("edge-2", "node-1", "node-2"));
      deleteEdges(["edge-1"]);
      const ids = getState().document.edges.map((e) => e.id);
      expect(ids).toEqual(["edge-2"]);
    });

    it("removes deleted edge from selectedEdgeIds", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      addEdge(makeEdge("edge-2", "node-1", "node-2"));
      setSelectedEdgeIds(["edge-1", "edge-2"]);
      deleteEdges(["edge-1"]);
      expect(getState().selectedEdgeIds).toEqual(["edge-2"]);
    });

    it("updates edge properties", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      updateEdge("edge-1", { label: "hello", style: "dashed", color: "#ff0000" });
      const edge = getState().document.edges[0];
      expect(edge.label).toBe("hello");
      expect(edge.style).toBe("dashed");
      expect(edge.color).toBe("#ff0000");
    });

    it("only updates the targeted edge, leaving others untouched", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      addEdge(makeEdge("edge-2", "node-1", "node-2", { label: "original" }));
      updateEdge("edge-1", { label: "changed" });
      expect(getState().document.edges[1].label).toBe("original");
    });
  });

  describe("updateNode / updateNodes", () => {
    it("applies partial bounds update", () => {
      addNodes([makeNode("node-1", { bounds: { x: 10, y: 20, width: 100, height: 50 } })]);
      updateNode("node-1", { bounds: { x: 30 } });
      const node = getState().document.nodes[0];
      expect(node.bounds).toEqual({ x: 30, y: 20, width: 100, height: 50 });
    });

    it("sets parentId on a node", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      updateNode("node-2", { parentId: "node-1" });
      expect(getState().document.nodes[1].parentId).toBe("node-1");
    });

    it("clears parentId when set to null", () => {
      addNodes([makeNode("node-1"), makeNode("node-2", { parentId: "node-1" })]);
      updateNode("node-2", { parentId: null });
      expect(getState().document.nodes[1].parentId).toBeUndefined();
    });

    it("updates label and color", () => {
      addNodes([makeNode("node-1")]);
      updateNode("node-1", { label: "Hello", nodeColor: "#aabbcc" });
      const node = getState().document.nodes[0];
      expect(node.label).toBe("Hello");
      expect(node.nodeColor).toBe("#aabbcc");
    });

    it("updates multiple nodes at once", () => {
      addNodes([makeNode("node-1"), makeNode("node-2"), makeNode("node-3")]);
      updateNodes([
        { id: "node-1", changes: { label: "A" } },
        { id: "node-3", changes: { label: "C", nodeColor: "#112233" } },
      ]);
      const nodes = getState().document.nodes;
      expect(nodes[0].label).toBe("A");
      expect(nodes[1].label).toBeUndefined();
      expect(nodes[2].label).toBe("C");
      expect(nodes[2].nodeColor).toBe("#112233");
    });
  });

  describe("getNodeById / getEdgeById", () => {
    it("returns the correct node", () => {
      addNodes([makeNode("node-1", { label: "First" }), makeNode("node-2", { label: "Second" })]);
      expect(getNodeById("node-1")?.label).toBe("First");
      expect(getNodeById("node-2")?.label).toBe("Second");
    });

    it("returns undefined for a missing node ID", () => {
      expect(getNodeById("nonexistent")).toBeUndefined();
    });

    it("returns the correct edge", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2", { label: "link" }));
      expect(getEdgeById("edge-1")?.label).toBe("link");
    });

    it("returns undefined for a missing edge ID", () => {
      expect(getEdgeById("nonexistent")).toBeUndefined();
    });

    it("invalidates cache after mutation and returns updated data", () => {
      addNodes([makeNode("node-1", { label: "old" })]);
      expect(getNodeById("node-1")?.label).toBe("old");
      updateNode("node-1", { label: "new" });
      expect(getNodeById("node-1")?.label).toBe("new");
    });

    it("invalidates edge cache after mutation", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2", { label: "old" }));
      expect(getEdgeById("edge-1")?.label).toBe("old");
      updateEdge("edge-1", { label: "new" });
      expect(getEdgeById("edge-1")?.label).toBe("new");
    });
  });

  describe("getConnectedEdgeIds / getConnectedNodeIds", () => {
    it("finds edges connected to a node (from side)", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      expect(getConnectedEdgeIds("node-1")).toEqual(["edge-1"]);
    });

    it("finds edges connected to a node (to side)", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      expect(getConnectedEdgeIds("node-2")).toEqual(["edge-1"]);
    });

    it("returns multiple connected edges", () => {
      addNodes([makeNode("node-1"), makeNode("node-2"), makeNode("node-3")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      addEdge(makeEdge("edge-2", "node-1", "node-3"));
      addEdge(makeEdge("edge-3", "node-2", "node-3"));
      expect(getConnectedEdgeIds("node-1")).toEqual(["edge-1", "edge-2"]);
    });

    it("returns empty array for unconnected node", () => {
      addNodes([makeNode("node-1")]);
      expect(getConnectedEdgeIds("node-1")).toEqual([]);
    });

    it("finds nodes connected to an edge", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      const connected = getConnectedNodeIds("edge-1");
      expect(connected).toContain("node-1");
      expect(connected).toContain("node-2");
      expect(connected).toHaveLength(2);
    });

    it("returns empty array for nonexistent edge", () => {
      expect(getConnectedNodeIds("nonexistent")).toEqual([]);
    });
  });

  describe("getChildNodeIds / getDescendantIds / getNodeDepth", () => {
    it("returns direct children", () => {
      addNodes([
        makeNode("node-1"),
        makeNode("node-2", { parentId: "node-1" }),
        makeNode("node-3", { parentId: "node-1" }),
        makeNode("node-4"),
      ]);
      const children = getChildNodeIds("node-1");
      expect(children).toContain("node-2");
      expect(children).toContain("node-3");
      expect(children).toHaveLength(2);
    });

    it("returns empty for a node with no children", () => {
      addNodes([makeNode("node-1")]);
      expect(getChildNodeIds("node-1")).toEqual([]);
    });

    it("returns multi-level descendants (grandchildren)", () => {
      addNodes([
        makeNode("node-1"),
        makeNode("node-2", { parentId: "node-1" }),
        makeNode("node-3", { parentId: "node-2" }),
        makeNode("node-4", { parentId: "node-2" }),
      ]);
      const descendants = getDescendantIds("node-1");
      expect(descendants).toContain("node-2");
      expect(descendants).toContain("node-3");
      expect(descendants).toContain("node-4");
      expect(descendants).toHaveLength(3);
    });

    it("returns empty descendants for leaf node", () => {
      addNodes([makeNode("node-1"), makeNode("node-2", { parentId: "node-1" })]);
      expect(getDescendantIds("node-2")).toEqual([]);
    });

    it("calculates depth 0 for root node", () => {
      addNodes([makeNode("node-1")]);
      expect(getNodeDepth("node-1")).toBe(0);
    });

    it("calculates depth for nested nodes", () => {
      addNodes([
        makeNode("node-1"),
        makeNode("node-2", { parentId: "node-1" }),
        makeNode("node-3", { parentId: "node-2" }),
      ]);
      expect(getNodeDepth("node-1")).toBe(0);
      expect(getNodeDepth("node-2")).toBe(1);
      expect(getNodeDepth("node-3")).toBe(2);
    });
  });

  describe("subscribe", () => {
    it("calls listener on state change", () => {
      const listener = vi.fn();
      subscribe(listener);
      addNodes([makeNode("node-1")]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("calls listener on every mutation", () => {
      const listener = vi.fn();
      subscribe(listener);
      addNodes([makeNode("node-1")]);
      addNodes([makeNode("node-2")]);
      setLocked(false);
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("unsubscribe stops notifications", () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);
      addNodes([makeNode("node-1")]);
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
      addNodes([makeNode("node-2")]);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("toggleSelectedNodeId", () => {
    it("adds a node ID when not already selected", () => {
      addNodes([makeNode("node-1")]);
      toggleSelectedNodeId("node-1");
      expect(getState().selectedNodeIds).toEqual(["node-1"]);
    });

    it("removes a node ID when already selected", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      setSelectedNodeIds(["node-1", "node-2"]);
      toggleSelectedNodeId("node-1");
      expect(getState().selectedNodeIds).toEqual(["node-2"]);
    });

    it("toggles back and forth", () => {
      addNodes([makeNode("node-1")]);
      toggleSelectedNodeId("node-1");
      expect(getState().selectedNodeIds).toEqual(["node-1"]);
      toggleSelectedNodeId("node-1");
      expect(getState().selectedNodeIds).toEqual([]);
    });
  });

  describe("setSelection / setSelectedNodeIds / setSelectedEdgeIds", () => {
    it("setSelectedNodeIds clears edge selection", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      setSelectedEdgeIds(["edge-1"]);
      expect(getState().selectedEdgeIds).toEqual(["edge-1"]);
      setSelectedNodeIds(["node-1"]);
      expect(getState().selectedNodeIds).toEqual(["node-1"]);
      expect(getState().selectedEdgeIds).toEqual([]);
    });

    it("setSelectedEdgeIds clears node selection", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      setSelectedNodeIds(["node-1"]);
      expect(getState().selectedNodeIds).toEqual(["node-1"]);
      setSelectedEdgeIds(["edge-1"]);
      expect(getState().selectedEdgeIds).toEqual(["edge-1"]);
      expect(getState().selectedNodeIds).toEqual([]);
    });

    it("setSelection sets both node and edge selections", () => {
      addNodes([makeNode("node-1"), makeNode("node-2")]);
      addEdge(makeEdge("edge-1", "node-1", "node-2"));
      setSelection(["node-1"], ["edge-1"]);
      expect(getState().selectedNodeIds).toEqual(["node-1"]);
      expect(getState().selectedEdgeIds).toEqual(["edge-1"]);
    });
  });

  describe("setLocked / setSnapToGrid / setDocumentTheme", () => {
    it("sets locked state", () => {
      expect(getState().locked).toBe(true);
      setLocked(false);
      expect(getState().locked).toBe(false);
      setLocked(true);
      expect(getState().locked).toBe(true);
    });

    it("sets snapToGrid state", () => {
      expect(getState().snapToGrid).toBe(true);
      setSnapToGrid(false);
      expect(getState().snapToGrid).toBe(false);
    });

    it("sets document theme", () => {
      setDocumentTheme("space");
      expect(getState().document.theme).toBe("space");
    });

    it("clears document theme with undefined", () => {
      setDocumentTheme("space");
      setDocumentTheme(undefined);
      expect(getState().document.theme).toBeUndefined();
    });
  });
});
