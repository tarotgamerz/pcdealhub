import githubExtension from "@github-tools/eve-extension";

export default githubExtension({
  preset: ["maintainer", "ci-ops", "repo-explorer"],
  context: {
    owner: "tarotgamerz",
    repo: "pcdealhub",
    ref: "main",
  },
});