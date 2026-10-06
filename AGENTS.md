# Agent Workflow

Shared development workflow for Pi, Codex and Claude Code. Generic engine,
native adapters and adapted skills belong here. Application stack rules belong
in consuming repositories. Read UPSTREAM.md before changing adapted skills.

Work on feature or fix branches. Preserve dirty work. Never commit, push or
publish without explicit user approval. Do not enable hook trust automatically.

Install development tools with npm ci --omit=peer. Source and tests are strict
TypeScript in the existing directories; npm run build emits ignored dist/
JavaScript. npm test builds first; npm pack builds through prepack and ships
compiled code only. Keep .js relative imports and shared core/types.ts contracts.
Run npm test, verify-install and npm pack before independent read-only review.
Review changes against acceptance criteria and boundary/adversarial cases; fix
findings before finalizing. Keep native manifests and installed copies consistent.

Node >=22.16 and a POSIX shell are required. Pi supplies its peer modules.
