import type { TestContext } from 'node:test';
import type { Fixtures } from './script-stubs.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { lists, runScript } from './script-stubs.ts';

const old = 'agent-workflow@agent-workflow-local';
const plugin = 'agent-workflow@ghulando';
const pi = 'git:github.com/ghulando/agent-workflow';

const run = (t: TestContext, fixtures: Fixtures) => runScript(t, 'install.sh', fixtures);

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
