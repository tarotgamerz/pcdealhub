# tarotai local executor bridge

This optional local sidecar lets a hosted tarotai deployment perform explicitly authorized PC tasks.

Safety model:
- Binds to 127.0.0.1 only.
- Requires Authorization: Bearer <TAROTAI_BRIDGE_TOKEN>.
- Filesystem access is restricted to TAROTAI_WORKDIR.
- Terminal execution only permits programs in TAROTAI_ALLOWED_COMMANDS.
- Do not expose this port directly to the public internet.

Windows example:
1. Set TAROTAI_BRIDGE_TOKEN to a long random secret.
2. Set TAROTAI_WORKDIR to the folder tarotai may access.
3. Set TAROTAI_ALLOWED_COMMANDS to a comma-separated allowlist such as git.exe,node.exe,npm.cmd,python.exe.
4. Run: node server.mjs

Important: a normal cloud-hosted website cannot reach your PC's localhost from Vercel. A secure outbound tunnel or relay that you control is still required for remote-to-local execution.