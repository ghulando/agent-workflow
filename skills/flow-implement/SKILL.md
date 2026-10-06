---
name: flow-implement
description: Implement a planned application feature or clear fix in small verified steps. Use once requirements and project conventions are understood.
---

Work from task acceptance criteria. Load relevant project stack skills and follow existing framework, library, naming and test choices. Personal skills do not authorize replacing them.

Implement one observable slice at a time. Run focused tests and relevant compiler, type checker or linter while working. Resolve a broken slice before piling dependent work onto it. Use flow-test for behavior coverage and flow-debug when the cause of failure is unclear.

Keep changes within scope. Do not weaken tests, hide failures behind fallbacks, or add unrelated refactors. Update task progress at checkpoints. When implementation disproves the plan, revise it and explain the material change.

Finish with flow-verify and flow-review. No automatic commit follows implementation.

Adapted from Matt Pocock implement and Pstack principle-sequence-verifiable-units; see ../../UPSTREAM.md.
