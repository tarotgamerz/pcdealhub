import { defineAgent } from "eve";
import { MODELS } from "../../lib/models.js";

export default defineAgent({
  description:
    "Independently review proposed or completed work for correctness, regressions, security mistakes and missing verification. Never change the project.",
  model: MODELS.reviewer,
  outputSchema: {
    additionalProperties: false,
    properties: {
      verdict: { enum: ["approve", "request_changes", "reject"], type: "string" },
      summary: { type: "string" },
      blocking_findings: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
      criteria_results: {
        type: "array",
        items: {
          additionalProperties: false,
          properties: {
            criterion: { type: "string" },
            pass: { type: "boolean" },
            evidence: { type: "string" },
          },
          required: ["criterion", "pass", "evidence"],
          type: "object",
        },
      },
    },
    required: ["verdict", "summary", "blocking_findings", "suggestions", "criteria_results"],
    type: "object",
  },
});
