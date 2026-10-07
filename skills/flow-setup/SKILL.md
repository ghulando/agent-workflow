---
name: flow-setup
description: Inspect a new repo and propose stack, checks and workflow configuration for user review. Use for project onboarding.
---

Run `node <plugin-root>/bin/workflow.ts setup <repo>` for a read-only JSON proposal. Inspect instructions, manifests, existing CI/tests and documented commands. The bounded scan identifies Vue/TypeScript, .NET, Python, Go and mixed workspaces; it does not prescribe frameworks, architecture, libraries or versions.

Review the full gate, protected branches, branch prefixes, task directory, project skills and available reviewers with the user. Root-only checks are insufficient for multi-application workspaces. Python tooling and framework choices come from the repo. Preserve hooks, permissions and plugins.

Save the proposal outside the repo to avoid staling its fingerprint. After user review, explicitly run `setup-apply <repo> <proposal-file>`. Regenerate stale proposals. Apply modifies workflow configuration only; install adapters separately. A detected manifest does not authorize dependency installs or setup scripts.

Preview personal installation with `install-user`; apply with `install-user --apply`. Native registration and explicit hook trust remain necessary. Prefer personal or repo installation in Pi; duplicate registration is suppressed.

Adapted from Pstack create-verification-skill repo observation and Matt Pocock per-repo setup; see ../../UPSTREAM.md.
