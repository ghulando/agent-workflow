import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/install.sh', import.meta.url));
const old = 'agent-workflow@agent-workflow-local';
const plugin = 'agent-workflow@ghulando';
const pi = 'git:github.com/ghulando/agent-workflow';

// Each stub logs its arguments and prints the fixture named after them; a .fail fixture exits 1.
const stub = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
key=$(echo "$(basename "$0") $*" | tr ' ' '-')
[ -f "$STUB_FIXTURES/$key" ] && cat "$STUB_FIXTURES/$key"
[ -f "$STUB_FIXTURES/$key.fail" ] && exit 1
exit 0
`;

type Fixtures = Record<string, string>;

function run(t: TestContext, fixtures: Fixtures) {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-install-script-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  const data = join(dir, 'fixtures');
  mkdirSync(bin);
  mkdirSync(data);
  for (const name of ['claude', 'codex', 'pi']) {
    writeFileSync(join(bin, name), stub);
    chmodSync(join(bin, name), 0o755);
  }
  // Only the stubs and the system tools are on PATH, so real harness CLIs cannot run.
  symlinkSync(process.execPath, join(bin, 'node'));
  for (const [key, content] of Object.entries(fixtures)) writeFileSync(join(data, key), content);
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const result = spawnSync('/bin/sh', [script], {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, STUB_LOG: log, STUB_FIXTURES: data },
  });
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line && !/ list( --json)?$/.test(line));
  return { ...result, calls };
}

const lists = (
  claudeMarkets: unknown,
  claudePlugins: unknown,
  codexMarkets: unknown,
  codexPlugins: unknown,
  piList: string,
): Fixtures => ({
  'claude-plugin-marketplace-list---json': JSON.stringify(claudeMarkets),
  'claude-plugin-list---json': JSON.stringify(claudePlugins),
  'codex-plugin-marketplace-list---json': JSON.stringify({ marketplaces: codexMarkets }),
  'codex-plugin-list---json': JSON.stringify({ installed: codexPlugins }),
  'pi-list': piList,
});

test('install script installs every harness on a fresh machine', (t) => {
  const result = run(t, lists([], [], [], [], 'User packages:\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'claude plugin marketplace add ghulando/agent-workflow',
    `claude plugin install ${plugin}`,
    'codex plugin marketplace add ghulando/agent-workflow',
    `codex plugin add ${plugin}`,
    `pi install ${pi}`,
  ]);
});

test('install script removes the old marketplace name and names project installs', (t) => {
  const result = run(
    t,
    lists(
      [{ name: 'agent-workflow-local' }],
      [
        { id: old, scope: 'project' },
        { id: old, scope: 'user' },
      ],
      [{ name: 'agent-workflow-local' }],
      [{ pluginId: old }],
      `User packages:\n  ${pi}\n    /home/.pi/agent/git/github.com/ghulando/agent-workflow\n`,
    ),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    `claude plugin uninstall ${old}`,
    'claude plugin marketplace remove agent-workflow-local',
    'claude plugin marketplace add ghulando/agent-workflow',
    `claude plugin install ${plugin}`,
    `codex plugin remove ${old}`,
    'codex plugin marketplace remove agent-workflow-local',
    'codex plugin marketplace add ghulando/agent-workflow',
    `codex plugin add ${plugin}`,
    `pi update ${pi}`,
  ]);
  assert.match(
    result.stdout,
    /claude plugin uninstall agent-workflow@agent-workflow-local --scope project/,
  );
});

test('install script refreshes and reinstalls an existing install', (t) => {
  const result = run(
    t,
    lists(
      [{ name: 'ghulando' }],
      [{ id: plugin, scope: 'user' }],
      [{ name: 'ghulando' }],
      [{ pluginId: plugin }],
      `User packages:\n  ${pi}\n`,
    ),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'claude plugin marketplace update ghulando',
    `claude plugin uninstall ${plugin}`,
    `claude plugin install ${plugin}`,
    'codex plugin marketplace upgrade ghulando',
    `codex plugin remove ${plugin}`,
    `codex plugin add ${plugin}`,
    `pi update ${pi}`,
  ]);
});

test('install script stops before changes when a harness reports unexpected output', (t) => {
  const result = run(t, { ...lists([], [], [], [], ''), 'claude-plugin-list---json': 'not json' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /Unexpected output from claude plugin list/);
});

test('install script stops before changes when a Claude plugin has no scope', (t) => {
  const result = run(t, lists([{ name: 'agent-workflow-local' }], [{ id: old }], [], [], ''));
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /Unexpected output from claude plugin list/);
});

test('install script stops when a listing command fails', (t) => {
  const result = run(t, { ...lists([], [], [], [], ''), 'pi-list.fail': '' });
  assert.notEqual(result.status, 0);
  assert.ok(!result.calls.some((call) => call.startsWith('pi ')));
});
