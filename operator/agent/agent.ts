import { defineAgent } from "eve";

export default defineAgent({
  model: process.env.OPERATOR_MODEL ?? "anthropic/claude-sonnet-5",
});
