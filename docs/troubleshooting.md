# Troubleshooting

Start with `doctor --author <author>` from the project root, using the runner path printed at session start. Doctor checks configuration and package content. It cannot tell whether a provider is logged in or whether hooks are running.

## No workflow context or guards

Register the plugin with the commands in the README install section, restart the harness and approve hook trust. A working install shows "Agent workflow is active" in the startup context.

Codex loads the hooks named in `.codex-plugin/plugin.json`. Do not add a root `plugin.json`: it shadows those hooks. References: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference), [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

"agent-workflow hook is missing" means the plugin was updated or removed while the session was open. Restart the harness.

"agent-workflow hook could not run" on every tool call, with `ERR_UNKNOWN_FILE_EXTENSION` from `node`, means the harness found a Node older than 22.18, which cannot run TypeScript. Check `node --version` in the environment the harness starts from.

"Worktree too large to verify within the hook time budget" means fingerprinting tracked and non-ignored files took over 40 seconds. Ignore large or generated files, or move them out of the repository. The hook denies here because past the 60-second harness timeout, Claude Code and Codex would run the tool without a decision.

Register the package either per user or per project in each harness, not both. Installation does not remove old guards; remove superseded ones yourself.

## A read command asks for approval

Use literal paths, known read options and globs with a directory prefix. `node -e`, Python snippets and unknown wrappers count as code execution even when the snippet only reads. For your own read-only tools, add a narrow `readCommands` rule ([configuration](configuration.md#read-commands)).

On feature branches, `shellApproval: "native"` hands shell permission to Claude Code or Codex. It never allows changes in plan mode or on protected branches.

## Approval does not take

Pi shows a dialog, Claude Code uses its native approval and Codex prints a request id to approve with `approve workflow <request-id>`. The retry must be the same operation in the same session on the same tree within ten minutes; anything else needs a new request.

## The gate passed but completion is blocked

Run the exact gate command from the session context, with no file changes or unclassified tools running alongside it. The runner reports whether the checks failed, the tree changed, or another change overlapped the run. Finish task notes before the final gate, because editing the task file afterwards invalidates the receipt. With review required, a passing recorded round 1 on the final tree is enough for the status-only edit that marks the task done. After a blocked review, fix once, rerun the gate and run one re-review. Remaining issues go to the user; tree changes invalidate the receipts.

Gate and review commands must come from the same package build as the running hook. Matching version numbers are not enough.

The fingerprint covers tracked and non-ignored files, file modes, symlink targets, the index, HEAD, the branch, personal settings and initialized nested Git checkouts. Ignored files and anything reached only through a symlink are not covered, so keep check inputs out of them. Initializing a submodule or repairing a broken nested repository changes the fingerprint and invalidates earlier receipts.

## Review has no usable provider

Run `doctor --author <author>`, configure an eligible reviewer in project or personal settings, and install and log in to that provider yourself. Task start refuses a configuration that requires review but has no eligible reviewer.

## A review stopped but still says it is running

Check `review-status`, and stop the coordinator and reviewer in the harness that started them. Then run:

```sh
node <installed-runner> review-recover docs/tasks/task.md
```

Recovery checks that the recorded processes are gone, keeps reports and verdicts, and clears the interrupted run. It kills nothing and grants no pass. Rerun the gate and retry the round.

If the launch record has a coordinator PID but no reviewer PID, for example after a spawn failure, first confirm by hand that the reviewer and its process group are gone, then run `review-recover <task-file> --stopped-reviewer`. Records with only a UUID, or with no process identity, cannot be recovered automatically. Do not delete private review state or hand off the task to escape failed rounds.

## Package content differs

Preview `install-user --repair`, then run `install-user --repair --apply`. For a vendored copy use `install-plan --repair` and `install --repair`. Save any intentional local edits first. Restart afterwards and approve hook trust again, since a running session keeps its original plugin copy.
