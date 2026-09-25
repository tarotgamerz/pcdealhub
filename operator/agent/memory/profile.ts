import { defineMemory } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";
import { fileMemory } from "eve/memory/file";

export default defineMemory({
  description: "Private owner preferences and durable working context. Save only useful, non-secret preferences and facts. Never save passwords, tokens, payment data, one-time codes, or credentials.",
  provider: fileMemory(),
  scope: byPrincipal,
});
