---
name: flow-handoff
description: Preserve portable task context and safely resume it in another harness. Use at session boundaries or when continuing existing work.
---

Keep the local task as the shared record; briefs and reports for other agents go in the task workspace printed by `task-resume`. Update decisions, progress, verification, findings and next step. Reference existing specs/evidence rather than duplicating them. Record blockers and assumptions. Redact secrets and omit machine-specific settings. Partial work stays open.

For a new authoring harness, use `node <plugin-root>/dist/bin/workflow.js task-handoff <task-file> --author <pi|codex|claude>`. This records the new author and invalidates transferred review evidence. It does not switch branches or authorize shipping. Never use handoff to reset a failed review.

The next session uses `task-resume <task-file>`, reads project instructions and relevant skills, then verifies the actual branch, diff and files against progress. Resolve branch mismatches without discarding other work. Gate receipts never transfer across sessions.

Adapted from Matt Pocock handoff, with persistent local tasks replacing temporary summaries; see ../../UPSTREAM.md.
