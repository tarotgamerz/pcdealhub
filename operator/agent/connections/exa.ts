import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.exa.ai/mcp",
  description: "Exa public web search, code search, research, and webpage contents. Use for current or unfamiliar information and verify important claims with primary sources when possible.",
});
