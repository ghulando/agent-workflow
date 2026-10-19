import type { TestContext } from 'node:test';
import type { Fixtures } from './script-stubs.ts';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
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

const empty = lists([], [], [], [], 'User packages:\n');

test('install script registers Grok and leaves hook trust to the user', (t) => {
  const fresh = runScript(
    t,
    'install.sh',
    { ...empty, 'grok-plugin-list---json': '[]' },
    {
      extra: ['grok'],
    },
  );
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.deepEqual(
    fresh.calls.filter((call) => call.startsWith('grok')),
    ['grok plugin marketplace update ghulando'],
  );
  // The plugin itself is installed only by the user, because it grants hook trust.
  assert.match(fresh.stdout, /grok plugin install halvard --trust/);
  const update = runScript(
    t,
    'install.sh',
    {
      ...empty,
      'grok-plugin-list---json': JSON.stringify({ plugins: [{ name: 'halvard' }] }),
      'grok-plugin-marketplace-update-ghulando.fail': '',
    },
    { extra: ['grok'] },
  );
  assert.equal(update.status, 0, update.stderr);
  assert.deepEqual(
    update.calls.filter((call) => call.startsWith('grok')),
    [
      'grok plugin marketplace update ghulando',
      'grok plugin marketplace add ghulando/halvard',
      'grok plugin update halvard',
    ],
  );
  assert.doesNotMatch(update.stdout, /--trust/);
});

test('install script stops before Grok changes on unexpected output', (t) => {
  const result = runScript(
    t,
    'install.sh',
    { ...empty, 'grok-plugin-list---json': '{}' },
    {
      extra: ['grok'],
    },
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.calls.some((call) => call.startsWith('grok')));
  assert.match(result.stderr, /Unexpected output from grok plugin list/);
});

// A Cursor clone from an earlier install; the git stub stands in for the pull.
function cursorClone(home: string) {
  const root = join(home, '.config/halvard/cursor');
  for (const dir of ['.git', 'hooks', 'skills/halvard', 'skills/halvard-spec']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(
    join(root, 'hooks/cursor.json'),
    readFileSync(new URL('../hooks/cursor.json', import.meta.url), 'utf8'),
  );
  return root;
}

test('install script merges Cursor hooks, keeps other entries and links the skills', (t) => {
  let root = '';
  const result = runScript(t, 'install.sh', empty, {
    extra: ['cursor-agent', 'git'],
    prepare: (home) => {
      root = cursorClone(home);
      mkdirSync(join(home, '.cursor/skills/halvard-spec'), { recursive: true });
      writeFileSync(
        join(home, '.cursor/hooks.json'),
        JSON.stringify({
          version: 1,
          hooks: {
            preToolUse: [
              { command: 'audit.sh' },
              { command: 'f="/old/bin/hook.ts"; node "$f" cursor', failClosed: true },
            ],
          },
        }),
      );
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.at(-1), `git -C ${root} pull --ff-only --quiet`);
  const cursorDir = join(result.home, '.cursor');
  const hooks = JSON.parse(readFileSync(join(cursorDir, 'hooks.json'), 'utf8')) as {
    hooks: Record<string, { command: string; failClosed?: boolean }[]>;
  };
  // The user's own entry stays; the earlier Halvard entry is replaced by the current one.
  assert.equal(hooks.hooks.preToolUse!.length, 2);
  assert.equal(hooks.hooks.preToolUse![0]!.command, 'audit.sh');
  assert.ok(hooks.hooks.preToolUse![1]!.command.startsWith(`f="${root}/bin/hook.ts"`));
  assert.equal(hooks.hooks.preToolUse![1]!.failClosed, true);
  assert.deepEqual(Object.keys(hooks.hooks).sort(), [
    'afterShellExecution',
    'beforeShellExecution',
    'beforeSubmitPrompt',
    'postToolUse',
    'preToolUse',
    'sessionStart',
  ]);
  assert.ok(existsSync(join(cursorDir, 'hooks.json.halvard.bak')));
  assert.equal(readlinkSync(join(cursorDir, 'skills/halvard')), join(root, 'skills/halvard'));
  // A skill directory of the user's own is kept.
  assert.equal(lstatSync(join(cursorDir, 'skills/halvard-spec')).isDirectory(), true);
  assert.match(result.stdout, /kept your own .*halvard-spec/);
});
