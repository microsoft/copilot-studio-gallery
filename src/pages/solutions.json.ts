import type { APIRoute } from "astro";
import { compareSolutions } from "../lib/catalog";
import { getPublishedSolutions } from "../lib/published";
import { solutionInventory } from "../lib/inventory";
import { submissionMakeup } from "../lib/schema";

export const GET: APIRoute = async () => {
  const solutions = (await getPublishedSolutions()).sort(compareSolutions);
  const payload = solutions.map((solution) => {
    const inventory = solutionInventory(solution.data);
    return {
      slug: solution.id,
      name: solution.data.name,
      description: solution.data.description,
      category: solution.data.category,
      tags: solution.data.tags,
      author: solution.data.author,
      authors: solution.data.authors,
      version: solution.data.version,
      download: solution.data.download,
      submissionType: solution.data.submissionType,
      makeup: submissionMakeup(solution.data),
      appCount: inventory.apps ?? 0,
      agentCount: inventory.agents,
      workflowCount: inventory.workflows,
      componentCount: inventory.components,
      featured: solution.data.featured,
      builtByMicrosoft: solution.data.featured,
    };
  });
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
