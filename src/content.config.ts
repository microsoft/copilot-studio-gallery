import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { solutionSchema } from "./lib/schema";

const solutions = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/solutions" }),
  schema: solutionSchema,
});

const guides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
  schema: z.looseObject({}),
});

export const collections = { solutions, guides };
