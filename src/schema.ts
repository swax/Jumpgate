import { z } from "zod";

export const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const nodeSchema = z.object({
  id: z.string(),
  bounds: boundsSchema,
  nodeColor: z.string().optional(),
  labelColor: z.string().optional(),
  label: z.string().optional(),
});

export type Bounds = z.infer<typeof boundsSchema>;

export const edgeEndpointSchema = z.union([
  z.object({ nodeId: z.string(), anchor: z.tuple([z.number(), z.number()]).optional() }),
  z.object({ x: z.number(), y: z.number() }),
]);

export const edgeSchema = z.object({
  id: z.string(),
  from: edgeEndpointSchema,
  to: edgeEndpointSchema,
  label: z.string().optional(),
  color: z.string().optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  arrow: z.enum(["none", "end", "start", "both"]).optional(),
});

export const documentSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).optional().default([]),
});

export type Node = z.infer<typeof nodeSchema>;
export type EdgeEndpoint = z.infer<typeof edgeEndpointSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type VscpDocument = z.infer<typeof documentSchema>;
