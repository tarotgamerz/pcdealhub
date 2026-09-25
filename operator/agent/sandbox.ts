import { agentBrowserRevalidationKey, installAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";

export const environment = VercelSandbox.environment();

export default defineSandbox(async () => {
  const sandbox = await environment.open({
    resources: { vcpus: 2 },
  });
  await installAgentBrowser(sandbox);
  return sandbox;
});
