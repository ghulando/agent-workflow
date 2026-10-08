# Usage

The workflow has two parts. The engine is code that runs on every tool call whether or not you mention it. The skills are instructions that tell the agent how to work. Solo and team runs use the same engine and the same skills; the team run adds the `flow-team` skill on top.

## Solo

Use one agent for most work: docs, one-file fixes, small features.

1. Open Claude Code, Codex or Pi in the repository and describe the task, or call `/workflow` with it.
2. The agent runs `task-start`, which needs a clean tree and creates `feature/<id>` and `docs/tasks/<id>.md`. Keep one task per branch. A second task on the same branch puts the first task's commits into the second task's review.
3. For anything beyond a small fix, the agent writes acceptance criteria and a plan into the task file and stops. Read them. This is the cheapest place to correct a wrong assumption.
4. The agent implements, runs the gate and updates the task notes.
5. The agent runs one recorded review. A pass completes the task. A blocked review gets one fix pass and one re-review; anything still open comes to you.
6. The agent shows the diff and asks before committing. Merge and push each need a separate yes.

Skills you call yourself: `flow-setup` once per new repository, `flow-debug` for a bug or slowdown, `flow-handoff` to move a task to another tool, and `clean-history` to prune session history. The `workflow` skill loads `flow-spec`, `flow-understand`, `flow-design`, `flow-implement`, `flow-test`, `flow-verify` and `flow-review` when a step needs them. The [flow diagram](flow.md) shows the steps.

## Team

Use the Herdr team for multi-file code changes where a second pair of eyes before the brief is worth the coordination. For docs or one-file fixes, solo is faster.

1. Open Herdr with three panes in the repository: Claude, Codex and Pi.
2. In the Claude pane, ask for the team and give the task, for example: "use flow-team: you lead, Codex implements, Pi reviews. Task: ...".
3. The lead runs preflight and reports everything missing in one message. It then creates the branch and task, and for risky code sends Pi to investigate before writing the brief. If the investigation shows a design choice, the lead asks you.
4. The lead briefs Codex with the acceptance criteria, known limits and the rule to stop when an existing test fails. It watches both panes and approves dialogs that fall inside the brief, one time each.
5. Codex runs the gate as its last action and reports its session key. The lead briefs Pi to review in its pane; Pi writes `pi-verdict-round1.json` in the task workspace, and the lead records it with `review ... --pane` and Codex's key.
6. You answer only what reaches you: a design choice, an out-of-scope request, a second blocked review, and commit, merge or push. On `main` the guard accepts only plain `git merge --ff-only` and `git branch -d` for shipping, each after your yes.

Requirements: `HERDR_ENV=1` in the panes, the Herdr read commands in your personal `readCommands`, and the task workspace (`~/.agent-workflow`) writable by Claude and Codex. [Configuration](configuration.md) lists the exact entries.

## Engine

The engine is the hooks, the shell guard, the gate and the review runner. It enforces the rules below in every harness and does not depend on the agent remembering them.

Hooks run at session start, on each prompt, and before and after each tool call. The session-start hook injects the session key, the gate command and the path to the `workflow` skill.

The guard keeps a small set of rules. On a protected branch (`main` and `master` by default) it allows only reads: built-in readers and entries in `readCommands`. Plan mode is read-only in the same way. Commit, merge, push and publish commands ask in every harness, as do edits to Git metadata, harness settings (`.claude`, `.codex`, `.pi`), `.agent-workflow.json` and the gate, review and extension scripts. Everything else on a feature or fix branch runs under the harness's own permissions. Claude Code shows its own dialog for an ask; Codex and Pi print `approve workflow <request-id>`, which you send as a chat message, and Pi also shows a dialog.

The gate is the command in `.agent-workflow.json`. Run it exactly as the session context prints it. A pass records a receipt for that exact tree. The receipt is lost when the tree changes.

The review runner sends the task and diff to a reviewer from another harness, with no tools. A passing review records a completion receipt for the tree. Each task allows two rounds unless `reviewExceptions` raises the limit for that task.

The task is marked done by a separate edit that changes only its status line. The guard allows that edit only when both a gate receipt and a review receipt match the current tree. Commit, merge, push and publish always wait for your explicit yes.
