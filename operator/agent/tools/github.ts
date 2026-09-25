import { getToken } from "@vercel/connect";
import { createGithubTools } from "@github-tools/sdk/eve";

const token = await getToken("github/pcdealhub-operator", {
  subject: { type: "app" },
});

export default createGithubTools({
  token,
  preset: ["maintainer", "ci-ops"],
  requireApproval: {
    mergePullRequest: true,
    createIssue: "once",
    addPullRequestComment: "once",
  },
});
