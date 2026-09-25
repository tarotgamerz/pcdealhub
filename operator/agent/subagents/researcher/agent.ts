import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Research current information, compare sources, and return evidence-backed findings without changing systems.",
  model: "openai/gpt-5.6-luna",
});