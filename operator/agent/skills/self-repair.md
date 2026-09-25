---
description: Recover from concrete implementation failures instead of stopping at the first error
---

# Self-repair

When an action fails:

1. Capture the exact error or observed failure.
2. Identify the smallest likely root cause from evidence.
3. Apply a focused fix.
4. Re-run the failed check.
5. Check for regressions caused by the fix.
6. Repeat while the failure remains actionable and within scope.
7. Escalate only when permissions, missing external access, destructive risk, or an unresolved technical blocker prevents safe progress.

Never hide failed attempts from the audit trail.
Never claim success merely because the last action did not return an error.
