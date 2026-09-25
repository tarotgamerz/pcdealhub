import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Review completed work for correctness, regressions, security mistakes and missing verification.",
  model: "openai/gpt-5.6-terra",
});