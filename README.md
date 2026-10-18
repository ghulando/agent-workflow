# Agent Workflow

Agent Workflow is a development workflow plugin for Claude Code, Codex and Pi. The agent works on a feature or fix branch and keeps notes in a task file. A task counts as done only after it passes your project's checks and a review by a different agent.

## How it works

There are two parts. The engine is a set of hooks that run at session start, on each prompt and around every tool call. Its guard allows only reads on `main`. It asks you before any commit, merge, push or publish. It refuses to mark a task done until the gate (the check command in `.agent-workflow.json`) and the review have both passed on the current tree. Everything else runs under the harness's own permissions. The skills are instructions that tell the agent how to plan, implement, test and review.

## Install

You need Node 22.18 or newer, Git and a POSIX shell.

```sh
curl -fsSL https://raw.githubusercontent.com/ghulando/agent-workflow/main/scripts/install.sh | sh
```

The script installs the plugin into every harness on your `PATH`. Restart open sessions and approve hook trust. [Install](docs/install.md) covers manual steps, updates, uninstalling and local clones. In a new repository, run `flow-bootstrap` and then `flow-setup`.

## Solo

Open one agent in the repository and describe the task, or call `/workflow`. The agent creates a branch and `docs/tasks/<id>.md`. For anything bigger than a small fix, it writes acceptance criteria and a plan, then stops so you can read them. Next it implements, runs the gate and sends the diff to a reviewer from another harness. A blocked review gets one fix pass and one re-review. Finally the agent shows the diff, offers a retro and asks before committing.

## Team with Herdr

For multi-file changes, open Herdr with Claude, Codex and Pi panes and ask the Claude pane for `flow-team`. Claude leads and writes the brief, Codex implements, and Pi investigates risky code and reviews in its own pane. The lead records Pi's verdict under the same gate and review rules. You answer design questions and handle a second blocked review. Commits still wait for your yes. The team needs `~/.agent-workflow` writable by Claude and Codex.

See [usage](docs/usage.md), the [flow diagram](docs/flow.md) and [configuration](docs/configuration.md).
