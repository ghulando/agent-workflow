import type { TestContext } from 'node:test';
import type { Fixtures } from './script-stubs.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { lists, runScript } from './script-stubs.ts';

// The earlier agent-workflow name, under the current and the older marketplace.
const oldLocal = 'agent-workflow@agent-workflow-local';
const oldGhulando = 'agent-workflow@ghulando';
const oldPi = 'git:github.com/ghulando/agent-workflow';
const plugin = 'halvard@ghulando';
const pi = 'git:github.com/ghulando/halvard';

const run = (t: TestContext, fixtures: Fixtures) => runScript(t, 'install.sh', fixtures);

test('install script installs every harness on a fresh machine', (t) => {
  const result = run(t, lists([], [], [], [], 'User packages:\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    'claude plugin marketplace add ghulando/halvard',
    `claude plugin install ${plugin}`,
    'codex plugin marketplace add ghulando/halvard',
    `codex plugin add ${plugin}`,
    `pi install ${pi}`,
  ]);
});

test('install script removes the earlier agent-workflow install and names project installs', (t) => {
  const result = run(
    t,
    lists(
      [{ name: 'agent-workflow-local' }, { name: 'ghulando' }],
      [
        { id: oldLocal, scope: 'project' },
        { id: oldLocal, scope: 'user' },
        { id: oldGhulando, scope: 'user' },
      ],
      [{ name: 'agent-workflow-local' }, { name: 'ghulando' }],
      [{ pluginId: oldLocal }, { pluginId: oldGhulando }],
      `User packages:\n  ${oldPi}\n    /home/.pi/agent/git/github.com/ghulando/agent-workflow\n`,
    ),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    `claude plugin uninstall ${oldGhulando}`,
    `claude plugin uninstall ${oldLocal}`,
    'claude plugin marketplace remove agent-workflow-local',
    'claude plugin marketplace update ghulando',
    `claude plugin install ${plugin}`,
    `codex plugin remove ${oldGhulando}`,
    `codex plugin remove ${oldLocal}`,
    'codex plugin marketplace remove agent-workflow-local',
    'codex plugin marketplace upgrade ghulando',
    `codex plugin add ${plugin}`,
    `pi remove ${oldPi}`,
    `pi install ${pi}`,
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
  const result = run(t, lists([{ name: 'agent-workflow-local' }], [{ id: oldLocal }], [], [], ''));
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /Unexpected output from claude plugin list/);
});

test('install script stops when a listing command fails', (t) => {
  const result = run(t, { ...lists([], [], [], [], ''), 'pi-list.fail': '' });
  assert.notEqual(result.status, 0);
  assert.ok(!result.calls.some((call) => call.startsWith('pi ')));
});
