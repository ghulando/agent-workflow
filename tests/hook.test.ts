import type { NativeHookOutput } from '../core/types.js';
import './environment.js';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hook = fileURLToPath(new URL('../bin/hook.js', import.meta.url));

for (const harness of ['claude', 'codex']) {
  test(`${harness}: subprocess hook emits native denial and rejects malformed input`, (t) => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-hook-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: root });
    writeFileSync(join(root, '.agent-workflow.json'), '{"version":1}');
    const payload = {
      cwd: root,
      session_id: 'native-hook',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'source.txt', content: 'change' },
    };
    const result = spawnSync(process.execPath, [hook, harness], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
    // Omitting hookSpecificOutput would silently stop enforcing native decisions.
    assert.equal(result.status, 0);
    assert.equal(
      (JSON.parse(result.stdout) as NativeHookOutput).hookSpecificOutput!.permissionDecision,
      'deny',
    );
    const invalid = spawnSync(process.execPath, [hook, harness], {
      input: '{invalid',
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
  });
}

test('ordinary prompts ignore malformed project config while approvals and tools fail closed', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-prompt-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: root });
  writeFileSync(join(root, '.agent-workflow.json'), '{invalid');
  for (const harness of ['claude', 'codex']) {
    const payload = { cwd: root, session_id: 'prompt-hook', hook_event_name: 'UserPromptSubmit' };
    for (const prompt of ['Fix the config', 'approve workflow invalid', undefined]) {
      const result = spawnSync(process.execPath, [hook, harness], {
        input: JSON.stringify({ ...payload, prompt }),
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout) as unknown, {});
    }
    for (const extra of [
      { prompt: `approve workflow ${'a'.repeat(64)}` },
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'source.txt', content: 'change' },
      },
    ]) {
      const result = spawnSync(process.execPath, [hook, harness], {
        input: JSON.stringify({ ...payload, ...extra }),
        encoding: 'utf8',
      });
      assert.equal(result.status, 2);
      assert.equal(result.stdout, '');
    }
  }
});

test('Codex keeps the hook-capable native manifest without a shadowing root manifest', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../.codex-plugin/plugin.json', import.meta.url)).toString('utf8'),
  ) as { hooks: string };
  assert.equal(manifest.hooks, './hooks/codex.json');
  assert.equal(existsSync(new URL('../../plugin.json', import.meta.url)), false);
});

test('native tool hooks fail closed when the hook script is missing', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-stale-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, variable] of [
    ['codex.json', 'PLUGIN_ROOT'],
    ['hooks.json', 'CLAUDE_PLUGIN_ROOT'],
  ] as const) {
    const config = JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../hooks/${file}`, import.meta.url)), 'utf8'),
    ) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const command = config.hooks[event]![0]!.hooks[0]!.command;
      // A plugin update can delete the directory a running session still uses.
      const stale = spawnSync('sh', ['-c', command], {
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, [variable]: join(root, 'deleted') },
      });
      assert.equal(stale.status, 2, `${file} ${event}`);
      assert.match(stale.stderr, /hook is missing .*restart/);
      const live = spawnSync('sh', ['-c', command], {
        input: '{invalid',
        encoding: 'utf8',
        env: { ...process.env, [variable]: fileURLToPath(new URL('../../', import.meta.url)) },
      });
      assert.equal(live.status, 2);
      assert.doesNotMatch(live.stderr, /could not run/);
    }
  }
});
