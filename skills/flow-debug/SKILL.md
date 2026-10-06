---
name: flow-debug
description: Reproduce and diagnose an application bug or performance regression before fixing its cause. Use for failures, incorrect behavior or unexplained slowness.
---

Build a tight feedback loop for the exact symptom: failing test, HTTP request, CLI fixture, browser script or captured replay. Run it and observe failure before claiming a cause. A different nearby failure does not reproduce this bug.

Minimize the scenario while preserving the symptom. For intermittent bugs, measure and raise the reproduction rate rather than claiming determinism. For performance, establish a measured baseline first.

Form a small set of falsifiable hypotheses. Change one variable per probe, using targeted instrumentation. Redact secrets from commands, logs and artifacts. If reproduction requires unavailable access, report the evidence gap and ask for it.

Turn the repro into a regression test at a seam that reaches the real failure. Apply the smallest root-cause fix, run that test and the original repro, and remove temporary instrumentation. Record the limitation if no adequate seam exists.

Adapted from Matt Pocock diagnosing-bugs; see ../../UPSTREAM.md.
