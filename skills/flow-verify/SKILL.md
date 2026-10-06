---
name: flow-verify
description: Demonstrate application acceptance criteria with real behavior and project checks. Use before independent review and completion.
---

Map acceptance criteria to evidence. Compilation alone does not prove a feature. Drive the real browser, HTTP API, CLI, library interface or background job with existing project harnesses. Verify the action, resulting state and important side effects. Mocks cannot prove an integration they replace.

Identify launch prerequisites, readiness, isolation and cleanup before starting the app. Use test data or dry-run modes after checking what they actually skip. Routine verification does not authorize deployments or production data changes.

Keep proof outside application sources where practical. Stop only processes you started; preserve proof artifacts and existing sessions. Record commands, results and skipped/blocked checks honestly in the task before final receipts.

Run the full configured gate through the session-context command, then follow flow-review. After fixes, rerun affected checks and ensure the full gate passes on the final tree. A printed success string is not a gate receipt.

Adapted from Pstack create-verification-skill and principle-prove-it-works; see ../../UPSTREAM.md.
