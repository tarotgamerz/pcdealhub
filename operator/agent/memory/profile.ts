import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";

export default defineMemory({
  description:
    "Stable facts and preferences about the PCDealHub owner. Never store secrets or unnecessary sensitive information.",
  provider: fileMemory(),
  scope: byPrincipal,
});