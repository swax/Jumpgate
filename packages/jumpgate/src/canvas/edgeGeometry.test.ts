import { describe, it, expect } from "vitest";
import {
  resolveAnchor,
  resolveEndpoint,
  buildPolylinePoints,
  computePolylineMidpoint,
  pointToSegmentDistance,
  PolylineHitArea,
} from "./edgeGeometry";

// ── resolveAnchor ──────────────────────────────────────────────────

describe("resolveAnchor", () => {
  const node = { x: 100, y: 200, width: 80, height: 40 };

  it("returns the center when no anchor is provided", () => {
    const result = resolveAnchor(node);
    expect(result).toEqual({ x: 140, y: 220 });
  });

  it("returns the center when anchor is explicitly [40, 20] (half of 80x40)", () => {
    const result = resolveAnchor(node, [40, 20]);
    expect(result).toEqual({ x: 140, y: 220 });
  });

  it("returns top-left corner for anchor [0, 0]", () => {
    const result = resolveAnchor(node, [0, 0]);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("returns top-right corner for anchor [80, 0]", () => {
    const result = resolveAnchor(node, [80, 0]);
    expect(result).toEqual({ x: 180, y: 200 });
  });

  it("returns bottom-left corner for anchor [0, 40]", () => {
    const result = resolveAnchor(node, [0, 40]);
    expect(result).toEqual({ x: 100, y: 240 });
  });

  it("returns bottom-right corner for anchor [80, 40]", () => {
    const result = resolveAnchor(node, [80, 40]);
    expect(result).toEqual({ x: 180, y: 240 });
  });

  it("handles midpoints of edges: top-center [40, 0]", () => {
    const result = resolveAnchor(node, [40, 0]);
    expect(result).toEqual({ x: 140, y: 200 });
  });

  it("handles midpoints of edges: right-center [80, 20]", () => {
    const result = resolveAnchor(node, [80, 20]);
    expect(result).toEqual({ x: 180, y: 220 });
  });

  it("handles a custom pixel anchor [20, 30]", () => {
    const result = resolveAnchor(node, [20, 30]);
    expect(result).toEqual({ x: 120, y: 230 });
  });

  it("works with a zero-size node", () => {
    const zeroNode = { x: 50, y: 50, width: 0, height: 0 };
    expect(resolveAnchor(zeroNode)).toEqual({ x: 50, y: 50 });
    expect(resolveAnchor(zeroNode, [0, 0])).toEqual({ x: 50, y: 50 });
  });
});

// ── resolveEndpoint ────────────────────────────────────────────────

describe("resolveEndpoint", () => {
  const nodeMap = new Map<string, { x: number; y: number; width: number; height: number }>([
    ["n1", { x: 0, y: 0, width: 100, height: 50 }],
    ["n2", { x: 200, y: 100, width: 60, height: 40 }],
  ]);

  it("resolves a node-anchored endpoint with default anchor (center)", () => {
    const result = resolveEndpoint({ nodeId: "n1" }, nodeMap);
    expect(result).toEqual({ x: 50, y: 25 });
  });

  it("resolves a node-anchored endpoint with explicit anchor", () => {
    const result = resolveEndpoint({ nodeId: "n2", anchor: [0, 40] }, nodeMap);
    expect(result).toEqual({ x: 200, y: 140 });
  });

  it("returns null when the referenced node is not in the map", () => {
    const result = resolveEndpoint({ nodeId: "missing" }, nodeMap);
    expect(result).toBeNull();
  });

  it("resolves a free-point endpoint directly", () => {
    const result = resolveEndpoint({ x: 42, y: 99 }, nodeMap);
    expect(result).toEqual({ x: 42, y: 99 });
  });

  it("resolves free-point with zero coordinates", () => {
    const result = resolveEndpoint({ x: 0, y: 0 }, nodeMap);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("resolves free-point with negative coordinates", () => {
    const result = resolveEndpoint({ x: -10, y: -20 }, nodeMap);
    expect(result).toEqual({ x: -10, y: -20 });
  });
});

// ── buildPolylinePoints ────────────────────────────────────────────

describe("buildPolylinePoints", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 100 };

  it("returns [from, to] when waypoints is undefined", () => {
    const result = buildPolylinePoints(from, to);
    expect(result).toEqual([from, to]);
  });

  it("returns [from, to] when waypoints is an empty array", () => {
    const result = buildPolylinePoints(from, to, []);
    expect(result).toEqual([from, to]);
  });

  it("includes a single waypoint between from and to", () => {
    const wp = { x: 50, y: 0 };
    const result = buildPolylinePoints(from, to, [wp]);
    expect(result).toEqual([from, wp, to]);
  });

  it("includes multiple waypoints in order", () => {
    const wp1 = { x: 25, y: 10 };
    const wp2 = { x: 50, y: 50 };
    const wp3 = { x: 75, y: 90 };
    const result = buildPolylinePoints(from, to, [wp1, wp2, wp3]);
    expect(result).toEqual([from, wp1, wp2, wp3, to]);
  });
});

// ── computePolylineMidpoint ────────────────────────────────────────

describe("computePolylineMidpoint", () => {
  it("returns {x:0,y:0} for an empty array", () => {
    const result = computePolylineMidpoint([]);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("returns the sole point for a single-point array", () => {
    const result = computePolylineMidpoint([{ x: 7, y: 13 }]);
    expect(result).toEqual({ x: 7, y: 13 });
  });

  it("returns the geometric midpoint of a horizontal segment", () => {
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(0);
  });

  it("returns the geometric midpoint of a vertical segment", () => {
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
    ]);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(40);
  });

  it("returns the geometric midpoint of a diagonal segment", () => {
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 60, y: 80 },
    ]);
    // Length = 100, midpoint at t=0.5
    expect(result.x).toBeCloseTo(30);
    expect(result.y).toBeCloseTo(40);
  });

  it("finds the correct midpoint on an L-shaped path", () => {
    // Segment 1: (0,0)->(100,0) length=100
    // Segment 2: (100,0)->(100,100) length=100
    // Total=200, half=100, so midpoint is at the corner (100,0)
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(0);
  });

  it("finds the midpoint in the second segment of an L-shaped path with unequal legs", () => {
    // Segment 1: (0,0)->(50,0) length=50
    // Segment 2: (50,0)->(50,200) length=200
    // Total=250, half=125, walked after seg1=50, remaining=75
    // t = 75/200 = 0.375 along seg2
    // x = 50, y = 0 + 200*0.375 = 75
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 200 },
    ]);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(75);
  });

  it("handles a multi-segment polyline", () => {
    // Four points forming three equal segments of length 10 each
    // Total = 30, half = 15
    // After seg1 (10): walked=10, need 5 more
    // Seg2: (10,0)->(20,0), t = 5/10 = 0.5 => x=15
    const result = computePolylineMidpoint([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
    expect(result.x).toBeCloseTo(15);
    expect(result.y).toBeCloseTo(0);
  });

  it("handles coincident points (zero-length segment)", () => {
    // Two identical points: totalLen=0, halfLen=0
    // First segment: segLen=0, walked+segLen >= halfLen (0>=0) => t=0
    const result = computePolylineMidpoint([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(result).toEqual({ x: 5, y: 5 });
  });
});

// ── pointToSegmentDistance ──────────────────────────────────────────

describe("pointToSegmentDistance", () => {
  it("returns 0 when point lies exactly on the segment start", () => {
    expect(pointToSegmentDistance(0, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("returns 0 when point lies exactly on the segment end", () => {
    expect(pointToSegmentDistance(10, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("returns 0 when point lies exactly on the segment midpoint", () => {
    expect(pointToSegmentDistance(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("returns the perpendicular distance for a point above a horizontal segment", () => {
    // Point (5, 3) is 3 units above the segment (0,0)-(10,0)
    expect(pointToSegmentDistance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("returns distance to the start when projection falls before the segment", () => {
    // Point (-3, 4) projects to t<0, closest is (0,0), dist=5
    expect(pointToSegmentDistance(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it("returns distance to the end when projection falls past the segment", () => {
    // Point (13, 4) projects to t>1, closest is (10,0), dist=5
    expect(pointToSegmentDistance(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it("handles a zero-length segment (returns distance to the point)", () => {
    // Segment is a single point at (5,5); query at (8,9)
    // dist = sqrt(9+16) = 5
    expect(pointToSegmentDistance(8, 9, 5, 5, 5, 5)).toBeCloseTo(5);
  });

  it("handles a zero-length segment with coincident query point", () => {
    expect(pointToSegmentDistance(5, 5, 5, 5, 5, 5)).toBeCloseTo(0);
  });

  it("handles a diagonal segment correctly", () => {
    // Segment from (0,0) to (10,10). Point at (10,0).
    // Projection: t = ((10)*10 + (0)*10) / (200) = 0.5 => closest (5,5)
    // dist = sqrt(25+25) = sqrt(50) ~ 7.071
    expect(pointToSegmentDistance(10, 0, 0, 0, 10, 10)).toBeCloseTo(Math.sqrt(50));
  });

  it("returns the correct distance for a vertical segment", () => {
    // Vertical segment (0,0)-(0,10), point at (4,5) => dist=4
    expect(pointToSegmentDistance(4, 5, 0, 0, 0, 10)).toBeCloseTo(4);
  });

  it("returns correct distance when point is directly beside the midpoint of a vertical segment", () => {
    expect(pointToSegmentDistance(-7, 5, 0, 0, 0, 10)).toBeCloseTo(7);
  });
});

// ── PolylineHitArea ────────────────────────────────────────────────

describe("PolylineHitArea", () => {
  describe("contains", () => {
    it("returns true for a point within tolerance of a horizontal segment", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      // 5 units above the segment, tolerance is 10
      expect(hitArea.contains(50, 5)).toBe(true);
    });

    it("returns true for a point exactly on the segment", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      expect(hitArea.contains(50, 0)).toBe(true);
    });

    it("returns true for a point at exactly the tolerance distance", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      expect(hitArea.contains(50, 10)).toBe(true);
    });

    it("returns false for a point just outside tolerance", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      expect(hitArea.contains(50, 11)).toBe(false);
    });

    it("returns false for a point far from any segment", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      expect(hitArea.contains(50, 100)).toBe(false);
    });

    it("checks multiple segments in a polyline", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        5
      );
      // Near first segment
      expect(hitArea.contains(50, 3)).toBe(true);
      // Near second segment
      expect(hitArea.contains(97, 50)).toBe(true);
      // Far from both
      expect(hitArea.contains(50, 50)).toBe(false);
    });

    it("returns true when a point is inside the labelRect", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        5
      );
      hitArea.labelRect = { x: 40, y: 10, width: 20, height: 10 };
      // Point (45, 15) is inside the label rect but far from the segment
      expect(hitArea.contains(45, 15)).toBe(true);
    });

    it("returns true when on the edge of the labelRect", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        5
      );
      hitArea.labelRect = { x: 40, y: 10, width: 20, height: 10 };
      // Exact corners/edges of the rect
      expect(hitArea.contains(40, 10)).toBe(true);
      expect(hitArea.contains(60, 20)).toBe(true);
    });

    it("returns false when outside both labelRect and tolerance", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        5
      );
      hitArea.labelRect = { x: 40, y: 10, width: 20, height: 10 };
      expect(hitArea.contains(70, 30)).toBe(false);
    });

    it("works without a labelRect (null by default)", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        5
      );
      expect(hitArea.labelRect).toBeNull();
      // Should still work based on segment distance
      expect(hitArea.contains(50, 3)).toBe(true);
      expect(hitArea.contains(50, 30)).toBe(false);
    });
  });

  describe("findSegmentIndex", () => {
    it("returns 0 for a single-segment polyline", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        10
      );
      expect(hitArea.findSegmentIndex(50, 5)).toBe(0);
    });

    it("returns the index of the closest segment in a multi-segment polyline", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        10
      );
      // Near the first segment (horizontal)
      expect(hitArea.findSegmentIndex(50, 1)).toBe(0);
      // Near the second segment (vertical)
      expect(hitArea.findSegmentIndex(99, 50)).toBe(1);
    });

    it("returns the first segment index when at the shared vertex", () => {
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        10
      );
      // At the corner (100,0): equidistant to both segments (dist=0), first wins
      expect(hitArea.findSegmentIndex(100, 0)).toBe(0);
    });

    it("returns the correct segment for a three-segment polyline", () => {
      const hitArea = new PolylineHitArea(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ],
        10
      );
      // Near segment 0
      expect(hitArea.findSegmentIndex(50, 0)).toBe(0);
      // Near segment 1
      expect(hitArea.findSegmentIndex(100, 50)).toBe(1);
      // Near segment 2
      expect(hitArea.findSegmentIndex(150, 100)).toBe(2);
    });

    it("returns 0 for a point equidistant to all segments (strict < comparison picks first)", () => {
      // L-shape: all segments at distance 10 from some point... just verify determinism
      const hitArea = new PolylineHitArea(
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
        10
      );
      // Point at (10, 5): dist to seg0 = 5, dist to seg1 = 5 => first one (index 0) wins
      expect(hitArea.findSegmentIndex(10, 5)).toBe(0);
    });
  });
});
