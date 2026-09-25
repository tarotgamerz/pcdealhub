import { defineAgent } from "eve";

export default defineAgent({
  description: "A private general-purpose autonomous Operator that researches, edits, executes, tests, reviews, remembers, and follows the authenticated owner's instructions.",
  model: "openai/gpt-5.6",
});
