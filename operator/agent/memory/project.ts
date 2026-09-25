import { defineMemory } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";
import { fileMemory } from "eve/memory/file";

export default defineMemory({
  description: "Durable project knowledge, decisions, verified findings, and lessons learned. Store provenance and dates for time-sensitive facts. Never store secrets.",
  provider: fileMemory(),
  scope: byPrincipal,
});
