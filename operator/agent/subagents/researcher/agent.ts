import { defineAgent } from "eve";

export default defineAgent({
  description: "Research unfamiliar, current, or ambiguous questions using reliable sources and return concise evidence with dates, caveats, and recommended next actions.",
  model: "openai/gpt-5.6",
});
