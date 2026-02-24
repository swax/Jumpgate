import { z } from "zod";

export const boxSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  color: z.string().optional(),
});

export const documentSchema = z.object({
  boxes: z.array(boxSchema),
});

export type Box = z.infer<typeof boxSchema>;
export type VscpDocument = z.infer<typeof documentSchema>;
