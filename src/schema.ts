import { z } from "zod";

export const nodeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  nodeColor: z.string().optional(),
  labelColor: z.string().optional(),
  label: z.string().optional(),
});

export const documentSchema = z.object({
  nodes: z.array(nodeSchema),
});

export type Node = z.infer<typeof nodeSchema>;
export type VscpDocument = z.infer<typeof documentSchema>;
