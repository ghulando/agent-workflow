#!/usr/bin/env node
import type { HookPayload } from '../core/types.ts';
import { handle } from '../core/runtime.ts';
import { hookOutput } from '../adapters/hooks.ts';

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 12 * 1024 * 1024) throw new Error('hook payload exceeds 12 MiB');
  }
  const payload = JSON.parse(raw) as HookPayload;
  const harness = process.argv[2];
  const result = await handle(harness, payload);
  process.stdout.write(JSON.stringify(hookOutput(harness, payload.hook_event_name, result)));
} catch (err) {
  process.stderr.write(`agent-workflow: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
