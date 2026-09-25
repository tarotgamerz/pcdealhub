import { defineAgent } from "eve";

export default defineAgent({
  description: "Act as an independent reviewer. Inspect diffs, tests, UX behavior, security implications, and factual correctness. Identify concrete defects and recommend or apply safe fixes when delegated.",
  model: "openai/gpt-5.6",
});
