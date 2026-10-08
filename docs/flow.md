# Using the skills

You rarely call a skill by name. At session start the hook points the agent at the `workflow` skill, and that skill loads the others when a step needs them. To run one step on its own, call the skill directly: `/agent-workflow:flow-debug` in Claude Code, `/skill:flow-debug` in Pi, `$flow-debug` in Codex.

## Once per repository

Run `flow-setup`, or the same commands yourself from the repository root:

```sh
node ~/.config/agent-workflow/package/bin/workflow.ts setup . > /tmp/workflow-setup.json
node ~/.config/agent-workflow/package/bin/workflow.ts setup-apply . /tmp/workflow-setup.json
node ~/.config/agent-workflow/package/bin/workflow.ts doctor --author claude
```

Before applying, edit the proposal: set `gate` to the command that fully checks the project and pick the reviewers you can run. Commit the resulting `.agent-workflow.json`. Every setting is described in [configuration](configuration.md).

## Each task

1. Ask for the feature or fix in plain words. `workflow` runs `task-start`, which needs a clean tree and creates a `feature/` or `fix/` branch and a task file under `docs/tasks/`.
2. For substantial or unclear work, `flow-spec` writes acceptance criteria and a short plan into the task file and stops. This is your checkpoint: read the plan and correct it. Small, clear fixes skip this step.
3. `flow-understand` traces unfamiliar code and what the change could break. `flow-design` compares two approaches when an interface or data shape would be hard to change later.
4. `flow-implement` builds one working slice at a time. `flow-test` adds behaviour tests, failing first. `flow-debug` reproduces a bug before fixing it.
5. `flow-verify` checks each acceptance criterion against the running code, then runs the gate. A passing gate records a receipt for the exact tree.
6. `flow-review` sends the task and diff to an independent reviewer. A passing first review supplies the completion receipt. After a blocked review, the agent fixes once, reruns the gate and asks for one re-review; remaining issues go to you.
7. Once the gate and a recorded review both pass on the final tree, the agent marks the task done and shows you the changes. Any later tree change invalidates the receipts. Commit, merge and push still wait for your yes.

## Approvals

When the guard needs your consent, for a commit, merge, push or publish or an edit to workflow, Git or harness settings, it prints a request id. Approve it by sending this as a chat message, not a shell command:

```
approve workflow <request-id>
```

The approval covers that one operation on the current tree and expires after ten minutes. An agent never approves its own request.

## Switching harness

`flow-handoff` moves a task to another tool. The notes stay and the new author starts a fresh review cycle:

```sh
node ~/.config/agent-workflow/package/bin/workflow.ts task-handoff docs/tasks/login.md --author codex
node ~/.config/agent-workflow/package/bin/workflow.ts task-resume docs/tasks/login.md
```

## Team through Herdr

`flow-team` runs only when you ask for a Herdr team, inside an active Herdr pane. By default Claude leads, Codex implements and Pi investigates before the brief for risky code; you can reassign roles or use two agents. Recorded review is the only review, and in a team it happens in a visible pane: a harness other than the author writes `<reviewer>-verdict-round<N>.json` in the task workspace, and the lead records it with `review ... --pane` and the author's final gate key. After your yes, the lead merges with a plain `git merge --ff-only` and deletes the merged branch with `git branch -d`. Workers report through the lead. Briefs and reports go in `~/.agent-workflow/<repo>/<task-id>/`, one writer per file, named by prefix such as `claude-brief-codex.md` ([details](configuration.md#task-workspace)). The lead approves teammates' requests inside the brief, using only one-time yes for dialogs. Anything out of scope, and the lead's own requests, come to you.

## Clearing local history

`clean-history` runs only when you invoke it. It asks which harness to clean and whether to save a dated summary under `~/agent-history-summaries/`, lists every file it will delete, then waits for you to type `DELETE`. It also clears every agent-workflow team workspace, active ones included, along with whole Claude project folders (their memory too) and harness caches and logs. Live session files stay. Codex databases and caches wait until every Codex process, including the background app-server, has stopped. A file that changes after the preview is skipped and the rest are still deleted. Credentials, settings, `CLAUDE.md`, the global Claude memory folder, plugins, skills and hooks are kept. Whether Codex honours the skill's no-auto-invoke flag is unverified.

Problems: [troubleshooting](troubleshooting.md).
