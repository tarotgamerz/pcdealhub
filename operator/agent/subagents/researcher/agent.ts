import { defineAgent } from "eve";
import { MODELS } from "../../lib/models.js";

export default defineAgent({
  description:
    "Research current information, compare primary sources, and return cited findings without changing systems. The caller supplies the question and any known context.",
  model: MODELS.researcher,
  outputSchema: {
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          additionalProperties: false,
          properties: {
            claim: { type: "string" },
            confidence: { enum: ["high", "medium", "low"], type: "string" },
            notes: { type: "string" },
            sources: {
              type: "array",
              minItems: 1,
              items: {
                additionalProperties: false,
                properties: { title: { type: "string" }, url: { type: "string" } },
                required: ["title", "url"],
                type: "object",
              },
            },
          },
          required: ["claim", "confidence", "notes", "sources"],
          type: "object",
        },
      },
      gaps: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "findings", "gaps"],
    type: "object",
  },
});
