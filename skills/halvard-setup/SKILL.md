---
name: halvard-setup
description: Inspect a new repo and propose stack, checks and workflow configuration for user review. Use for project onboarding.
---

Run `node <plugin-root>/bin/halvard.ts setup <repo>` for a read-only JSON proposal. Inspect instructions, manifests, existing CI/tests and documented commands. The bounded scan identifies Vue/TypeScript, .NET, Python, Go and mixed workspaces; it does not prescribe frameworks, architecture, libraries or versions.

Review the full gate, protected branches, branch prefixes, task directory, project skills, available reviewers and which reviewer each author gets with the user. An entry keyed by an author, such as `"claude": {"reviewer": "codex"}`, fixes that author's solo reviewer and model; its own harness needs an explicit model and reviews only headless. Later review rounds keep the first round's reviewer. Root-only checks are insufficient for multi-application workspaces. Python tooling and framework choices come from the repo. An empty repository, or one without stack rules and skills, goes through [halvard-bootstrap](../halvard-bootstrap/SKILL.md) first; `setup` then proposes the recorded stack gate while no gate is configured. Preserve hooks, permissions and plugins.

Save the proposal outside the repo to avoid staling its fingerprint. After user review, explicitly run `setup-apply <repo> <proposal-file>`. Regenerate stale proposals. Apply modifies workflow configuration only; install adapters separately. A detected manifest does not authorize dependency installs or setup scripts.

Preview personal installation with `install-user`; apply with `install-user --apply`. Native registration and explicit hook trust remain necessary. Prefer personal or repo installation in Pi; duplicate registration is suppressed.

Adapted from Pstack create-verification-skill repo observation and Matt Pocock per-repo setup; see ../../UPSTREAM.md.
