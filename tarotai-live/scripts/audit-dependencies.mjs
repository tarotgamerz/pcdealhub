import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  timeout: 60000,
  maxBuffer: 8 * 1024 * 1024,
  shell: process.platform === "win32"
});

let report;
try {
  report = JSON.parse(result.stdout || "");
} catch {
  const detail = String(result.stderr || result.error?.message || "npm audit did not return JSON").trim();
  console.error("Dependency audit could not be parsed; refusing to treat an unknown audit result as safe:", detail.slice(0, 1200));
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities || {};
console.log("DEPENDENCY AUDIT SUMMARY", JSON.stringify(counts));
const found = Object.entries(report.vulnerabilities || {}).sort((a, b) => {
  const rank = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
  return (rank[b[1]?.severity] || 0) - (rank[a[1]?.severity] || 0) || a[0].localeCompare(b[0]);
});
for (const [name, item] of found) {
  const advisories = (item.via || [])
    .filter((entry) => typeof entry === "object")
    .map((entry) => ({ title: entry.title, range: entry.range, url: entry.url }));
  console.log("DEPENDENCY AUDIT ITEM", JSON.stringify({
    name,
    severity: item.severity,
    isDirect: item.isDirect,
    range: item.range,
    fixAvailable: item.fixAvailable,
    via: item.via,
    effects: item.effects,
    nodes: item.nodes,
    advisories
  }));
}
if (!found.length) {
  console.log("DEPENDENCY AUDIT: no vulnerable package entries reported.");
} else {
  console.error("DEPENDENCY AUDIT FAILED: " + found.length + " vulnerable package entries found.");
  process.exitCode = 1;
}
