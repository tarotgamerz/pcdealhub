import { readFileSync } from "node:fs";

const route = readFileSync("app/api/chat/route.ts", "utf8");
const auth = readFileSync("app/api/auth/route.ts", "utf8");
const health = readFileSync("app/api/health/route.ts", "utf8");
const documents = readFileSync("app/api/documents/route.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");

const required = [
  'name: "set_plan"',
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
  'if (name === "read_webpage")',
  'documents',
  'documentContext(documents)'
];

const forbidden = [
  'memory:state.memory',
  'AI_GATEWAY_API_KEY'
];

const authRequired = [
  'authenticated: session',
  'if (!required)',
  'TAROTAI_ACCESS_CODE',
  'accessCodeConfigured: Boolean(process.env.TAROTAI_ACCESS_CODE)'
];
const healthRequired = [
  'hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY)',
  'hasExa: Boolean(process.env.EXA_API_KEY)',
  'securityMode: process.env.NODE_ENV === "production" ? "access-code-required" : "development"'
];

const missing = required.filter((needle) => !route.includes(needle));
const missingAuth = authRequired.filter((needle) => !auth.includes(needle));
const documentRequired = [
  'export async function POST',
  'new FormData',
  'MAX_BYTES = 12 * 1024 * 1024',
  'getTextExtractor',
  'Authentication required'
];
const dependencyRequired = ['"office-text-extractor":"4.0.0"'];

const missingHealth = healthRequired.filter((needle) => !health.includes(needle));
const missingDocuments = documentRequired.filter((needle) => !documents.includes(needle));
const missingDependency = dependencyRequired.filter((needle) => !packageJson.includes(needle));
const presentForbidden = forbidden.filter((needle) => route.includes(needle));

if (missing.length || missingAuth.length || missingHealth.length || missingDocuments.length || missingDependency.length || presentForbidden.length) {
  console.error("TarotAI runtime contract failed.");
  if (missing.length) console.error("Missing chat/tool contract:", missing);
  if (missingAuth.length) console.error("Missing auth contract:", missingAuth);
  if (missingHealth.length) console.error("Missing health contract:", missingHealth);
  if (missingDocuments.length) console.error("Missing document contract:", missingDocuments);
  if (missingDependency.length) console.error("Missing dependency:", missingDependency);
  if (presentForbidden.length) console.error("Forbidden:", presentForbidden);
  process.exit(1);
}

console.log("TarotAI runtime contract passed.");
