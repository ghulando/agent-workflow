---
name: flow-test
description: Write behavior-based tests and use a red-green loop at meaningful application interfaces. Use for regression coverage and new behavior.
---

Choose the interface where real callers observe behavior. Match project conventions and acceptance criteria. Discuss a consequential new test boundary when it changes the design; existing clear boundaries need no extra approval.

For a bug or test-first feature, run one meaningful failing test, implement enough to pass it, then add the next slice. Avoid bulk suites against imagined implementations. Refactor within authorized scope and preserve observed behavior.

Assert independently known results. Do not recompute the implementation in expectations, test private call sequences or mock away the behavior. Mock genuine external boundaries when needed. Use hostile and boundary inputs that distinguish wrong behavior.

For each new test, name a one-line code mutation that would make it fail. If none exists, it proves nothing useful. Differential fixtures must distinguish implementations. Keep tests deterministic and cover relevant error paths.

Adapted from Matt Pocock tdd and Pstack principle-test-behavior-not-implementation; see ../../UPSTREAM.md.
