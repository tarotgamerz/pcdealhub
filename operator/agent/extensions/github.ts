import githubExtension from "@github-tools/eve-extension";

export default githubExtension({
  preset: "maintainer",
  context: {
    owner: "tarotgamerz",
    repo: "pcdealhub",
    ref: "main",
  },
});
