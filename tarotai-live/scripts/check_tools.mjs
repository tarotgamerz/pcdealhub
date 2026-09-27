import { readFileSync } from "node:fs";

const route = readFileSync("app/api/chat/route.ts", "utf8");

const required = [
  'name: "get_current_datetime"',
  'name: "github_list_commits"',
  'name: "github_actions_runs"',
  'name: "github_read_file"',
  'name: "search_web"',
  'name: "read_webpage"',
  'if (name === "get_current_datetime")',
  'if (name === "github_list_commits")',
  'if (name === "github_actions_runs")',
  'if (name === "github_read_file")',
  'if (name === "search_web")',
  'if (name === "read_webpage")'
];

const forbidden = [
  'memory:state.memory',
  'AI_GATEWAY_API_KEY'
];

const missing = required.filter((needle) => !route.includes(needle));
const presentForbidden = forbidden.filter((needle) => route.includes(needle));

if (missing.length || presentForbidden.length) {
  console.error("TarotAI tool contract failed.");
  if (missing.length) console.error("Missing:", missing);
  if (presentForbidden.length) console.error("Forbidden:", presentForbidden);
  process.exit(1);
}

console.log("TarotAI tool contract passed.");
