import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { solutionMakeup } from "../lib/schema";

export const GET: APIRoute = async () => {
  const solutions = await getCollection("solutions");
  const payload = solutions
    .map((solution) => ({
      slug: solution.id,
      name: solution.data.name,
      description: solution.data.description,
      tags: solution.data.tags,
      author: solution.data.author,
      version: solution.data.version,
      makeup: solutionMakeup(solution.data.agentCount, solution.data.workflowCount),
      agentCount: solution.data.agentCount,
      workflowCount: solution.data.workflowCount,
      featured: solution.data.featured,
    }))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
