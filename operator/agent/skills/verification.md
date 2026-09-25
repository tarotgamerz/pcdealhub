---
description: Verify changes instead of assuming they worked
---

# Verification skill

A task is not complete because a file changed.

After implementation:
- run the most relevant static checks;
- inspect the resulting diff;
- exercise the changed feature when possible;
- for web UI changes, use a browser check when available;
- for deployments, inspect deployment/build status rather than trusting a success message;
- when a test fails, fix the root cause and run the test again.

Report verification evidence explicitly.
