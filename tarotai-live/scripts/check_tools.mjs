import { readFileSync } from "node:fs";

const route = readFileSync("app/api/chat/route.ts", "utf8");
const auth = readFileSync("app/api/auth/route.ts", "utf8");
const health = readFileSync("app/api/health/route.ts", "utf8");
const documents = readFileSync("app/api/documents/route.ts", "utf8");
const memory = readFileSync("app/api/memory/route.ts", "utf8");
const state = readFileSync("app/api/state/route.ts", "utf8");
const apps = readFileSync("app/api/apps/route.ts", "utf8");
const vision = readFileSync("app/api/vision/route.ts", "utf8");
const audit = readFileSync("app/api/audit/route.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");

const required = [
  'name: "search_attached_documents"',
  'name: "set_plan"',
  'name: "get_current_datetime"',
  'name: "github_list_commits"',
  'name: "github_actions_runs"',
  'name: "github_read_file"',
  'name: "search_web"',
  'name: "read_webpage"',
  'if (name === "security_audit_url")',
  'if (name === "search_attached_documents")',
  'if (name === "get_current_datetime")',
  'if (name === "github_list_commits")',
  'if (name === "github_actions_runs")',
  'if (name === "github_read_file")',
  'if (name === "search_web")',
  'if (name === "read_webpage")',
  'getComposioRuntime',
  'session.execute',
  'documents',
  'search_attached_documents',
  'security_audit_url',

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
  'request.formData()',
  'MAX_BYTES = 12 * 1024 * 1024',
  'getTextExtractor',
  'Authentication required'
];
const memoryRequired = ['memoryEnabled', 'memoryKey', 'forbiddenMemoryKey', 'export async function POST'];
const stateRequired = ['stateKey', 'export async function GET', 'export async function POST'];
const appRequired = ['new Composio', 'session!.toolkits', 'session!.authorize'];
const visionRequired = ['OPENROUTER_VISION_MODEL', 'image_url', 'dataUrl'];
const auditRequired = ['auditKey', 'lrange', 'JSON.parse'];
const dependencyRequired = ['"office-text-extractor": "4.0.0"', '"@composio/core": "0.18.1"', '"@upstash/redis": "1.39.0"'];

const missingHealth = healthRequired.filter((needle) => !health.includes(needle));
const missingDocuments = documentRequired.filter((needle) => !documents.includes(needle));
const missingMemory = memoryRequired.filter((needle) => !memory.includes(needle));
const missingState = stateRequired.filter((needle) => !state.includes(needle));
const missingApps = appRequired.filter((needle) => !apps.includes(needle));
const missingVision = visionRequired.filter((needle) => !vision.includes(needle));
const missingAudit = auditRequired.filter((needle) => !audit.includes(needle));
const missingDependency = dependencyRequired.filter((needle) => !packageJson.includes(needle));
const presentForbidden = forbidden.filter((needle) => route.includes(needle));

if (missing.length || missingAuth.length || missingHealth.length || missingDocuments.length || missingMemory.length || missingState.length || missingApps.length || missingVision.length || missingAudit.length || missingDependency.length || presentForbidden.length) {
  console.error("TarotAI runtime contract failed.");
  if (missing.length) console.error("Missing chat/tool contract:", missing);
  if (missingAuth.length) console.error("Missing auth contract:", missingAuth);
  if (missingHealth.length) console.error("Missing health contract:", missingHealth);
  if (missingDocuments.length) console.error("Missing document contract:", missingDocuments);
  if (missingMemory.length) console.error("Missing memory contract:", missingMemory);
  if (missingState.length) console.error("Missing state contract:", missingState);
  if (missingApps.length) console.error("Missing apps contract:", missingApps);
  if (missingVision.length) console.error("Missing vision contract:", missingVision);
  if (missingAudit.length) console.error("Missing audit contract:", missingAudit);
  if (missingDependency.length) console.error("Missing dependency:", missingDependency);
  if (presentForbidden.length) console.error("Forbidden:", presentForbidden);
  process.exit(1);
}

console.log("TarotAI runtime contract passed.");
