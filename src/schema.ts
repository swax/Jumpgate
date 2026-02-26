import { z } from "zod";

export const directionValues = ["up", "right", "down", "left"] as const;
export type NodeDirection = (typeof directionValues)[number];

export const shapeValues = [
  "rectangle",
  "rounded-rectangle",
  "ellipse",
  "diamond",
  "parallelogram",
  "trapezoid",
  "triangle",
  "cylinder",
  "pill",
  "half-ellipse",
  "half-pill",
  "document",
  "text",
] as const;

export type NodeShape = (typeof shapeValues)[number];

export const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const fileLinkSchema = z.object({
  path: z.string(),
  match: z.string().optional(),
});

export const nodeSchema = z.object({
  id: z.string(),
  bounds: boundsSchema,
  nodeColor: z.string().optional(),
  labelColor: z.string().optional(),
  label: z.string().optional(),
  fileLink: fileLinkSchema.optional(),
  shape: z.enum(shapeValues).optional(),
  direction: z.enum(directionValues).optional(),
  parentId: z.string().optional(),
});

export type Bounds = z.infer<typeof boundsSchema>;
export type FileLink = z.infer<typeof fileLinkSchema>;

export const edgeEndpointSchema = z.union([
  z.object({ nodeId: z.string(), anchor: z.tuple([z.number(), z.number()]).optional() }),
  z.object({ x: z.number(), y: z.number() }),
]);

export const edgeSchema = z.object({
  id: z.string(),
  from: edgeEndpointSchema,
  to: edgeEndpointSchema,
  waypoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  labelColor: z.string().optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  arrow: z.enum(["none", "end", "start", "both"]).optional(),
  fileLink: fileLinkSchema.optional(),
});

export const documentSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).optional().default([]),
});

export type Node = z.infer<typeof nodeSchema>;
export type EdgeEndpoint = z.infer<typeof edgeEndpointSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type VscpDocument = z.infer<typeof documentSchema>;
