import { z } from "zod";

export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export type Box = z.infer<typeof boxSchema>;
