import { readFileSync } from "node:fs";
import { Script } from "node:vm";
const html=readFileSync(new URL("../public/trading-desk.html",import.meta.url),"utf8");
const matches=[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if(matches.length!==1)throw new Error("Expected exactly one inline dashboard script");
new Script(matches[0][1],{filename:"trading-desk.html:inline-script"});
console.log("Dashboard inline JavaScript syntax check passed");
