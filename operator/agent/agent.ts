import { defineAgent } from "eve";
import { MODELS } from "./lib/models.js";

export default defineAgent({
  model: MODELS.orchestrator,
});
