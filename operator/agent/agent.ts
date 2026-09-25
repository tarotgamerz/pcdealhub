import { defineAgent } from "eve";

export default defineAgent({
  model: process.env.OPERATOR_MODEL ?? "openai/gpt-6-astra",
});