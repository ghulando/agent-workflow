---
name: clean-history
description: Clear selected local Claude Code, Pi or Codex history, project folders, caches and logs, plus all agent-workflow team workspaces, only when the user explicitly invokes this skill.
disable-model-invocation: true
---

Refuse unless the user explicitly invoked this skill. Resolve the installed plugin root from this skill's location and use its absolute path as `<plugin-root>` below. Never improvise deletion commands or run the cleaner without a reviewed plan and confirmation.

First ask which harness to clean: Claude Code, Pi, Codex or all. Then ask whether to write a Markdown summary before deleting. Use `claude`, `pi`, `codex`, a comma-separated selection or `all` as `<harnesses>`.

Run `node <plugin-root>/bin/workflow.ts history-plan --harness <harnesses>`. Show every entry in the returned plan, grouped by harness, with its absolute path and bytes. Show every kept-live and deferred entry with its reason. Every selection also removes all agent-workflow team task workspaces, including active task briefs and reports. Explain that these files, past-session resume history, whole Claude project folders including their per-project memory, and harness caches and logs will be lost. Settings, credentials, `CLAUDE.md`, the global Claude memory folder, plugins, skills, hooks, packages and private workflow guard state survive.

If the user chose a summary, run `node <plugin-root>/bin/workflow.ts history-digest --harness <harnesses>`. Write one dated Markdown file to `~/agent-history-summaries/<YYYY-MM-DD>-<harnesses>.md`, creating the folder if needed. Resolve the destination and refuse if it is inside any selected deletion root or a planned target, including through symlinks. Choose a fresh suffix if the file already exists. Group by harness and project; include each session's dates, prompt count, first prompt and a one-line gist inferred only from those fields. State that this compact summary is not a transcript backup. If digesting or writing fails, stop before deletion. Show the saved file path before continuing.

Ask the user to type exactly `DELETE`. After that response, run `node <plugin-root>/bin/workflow.ts history-clean <plan-file> --confirm DELETE` using the exact plan path returned earlier. Host and workflow approvals still apply. Apply deletes only reviewed entries. Prompt appends to a running harness history.jsonl are tolerated; new entries are kept and reported as appeared after preview. A reviewed entry that changed, disappeared or became live is skipped and the rest are still deleted. If the command itself refuses, report the refusal. Report removed paths and bytes, skipped entries with reasons, failures, kept live files and entries that appeared after preview. For deferred Codex files, give the user the PIDs named in the reason, tell them to stop those processes and rerun the skill. Do not claim all history was cleared while skipped, failed, live or deferred files remain.
