import { defineAgent } from "eve";

export default defineAgent({
  description: "Implement code and content changes in the isolated workspace. Inspect existing code first, make focused changes, run relevant checks, and return the changed areas plus verification evidence.",
  model: "openai/gpt-5.6",
});
