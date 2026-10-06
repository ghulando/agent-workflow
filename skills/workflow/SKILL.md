---
name: workflow
description: Run the shared application-development flow from requirements and branch creation through verification and independent review. Use for starting, resuming, or finishing implementation tasks.
---

Project instructions and user choices override workflow defaults. Keep replies short and code consistent with its surroundings. Technology decisions belong in the project.

Use [flow-team](../flow-team/SKILL.md) only when the user explicitly asks to run a multi-agent team through Herdr.

## Start or resume

Read AGENTS.md, CLAUDE.md if present, .agent-workflow.json and the task. Inspect the branch and existing changes. Never stash, reset, restore, clean or switch a dirty tree to manufacture a baseline.

Substantial tasks use [flow-spec](../flow-spec/SKILL.md) for observable acceptance criteria and a short plan before coding. Small, clear fixes proceed directly. Use `node <plugin-root>/dist/bin/workflow.js task-start <id> '<title>' --author <pi|codex|claude>`; add `--fix` for fixes and `--small` for small tasks. The command creates the configured branch from the configured base only on a clean tree. Preserve existing work and ask how tasks should be separated when it blocks a new branch.

For existing work, use `task-resume <task-file>` and [flow-handoff](../flow-handoff/SKILL.md). Recorded progress is context to verify, not proof.

## Implement

Load [flow-understand](../flow-understand/SKILL.md) for unfamiliar code, [flow-design](../flow-design/SKILL.md) for consequential interface choices, and [flow-implement](../flow-implement/SKILL.md) for implementation slices. Use [flow-debug](../flow-debug/SKILL.md) for defects and [flow-test](../flow-test/SKILL.md) when writing tests. Read required and relevant project stack skills before editing. Name only skills actually loaded; do not read the whole catalog.

Update task decisions, progress and next step at meaningful checkpoints. Keep credentials and machine-specific settings out of task files.

## Finish every task

Use [flow-verify](../flow-verify/SKILL.md), run the session-context full gate, and walk project invariants. Then use [flow-review](../flow-review/SKILL.md) for independent review. This applies to small fixes too.

A passing recorded review, including round 1, supplies the review receipt for completion. After a blocked review, fix once, record fixes in the task, rerun affected checks and run one re-review. Remaining blocking findings keep the task unfinished; do not manufacture extra review cycles. The full gate and passing review must both cover the final tree. Update task notes before final checks so documentation edits do not stale them. Mark done with a file-edit tool after both receipts exist. Checks passing does not prove acceptance criteria.

Show what changed, why, and verification evidence. Commit, merge, push, publish, deploy and external ticket/chat updates require explicit authorization. An implementation plan is not shipping approval. Never approve your own workflow request.

New repos use [flow-setup](../flow-setup/SKILL.md). Plan/review sessions are read-only; exit native plan mode (Pi: /plan) before implementation or running checks.

Adapted from Pstack poteto-mode and Matt Pocock implement. See ../../UPSTREAM.md for pinned sources and licenses.
