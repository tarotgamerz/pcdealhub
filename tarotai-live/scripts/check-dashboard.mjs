import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const pages = ["console.html", "agents.html", "trading-desk.html", "trading.html"];
for (const page of pages) {
  const html = readFileSync(new URL("../public/" + page, import.meta.url), "utf8");
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  if (matches.length !== 1) {
    throw new Error("Expected exactly one inline script in " + page + "; found " + matches.length);
  }
  new Script(matches[0][1], { filename: page + ":inline-script" });
  console.log(page + " inline JavaScript syntax check passed");
}
