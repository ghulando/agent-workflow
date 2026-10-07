import type { ReadCommand, ShellKind } from './types.ts';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

// Redirections that discard output or merge stderr cannot write project files.
const DISCARD = /^(?:[12]?>\/dev\/null|2>&1)(?=[\s;|&]|$)/;

// Unknown shell syntax is opaque. A command classifier is not a shell sandbox.
function parse(text: string, comments = true) {
  const segments: string[][] = [];
  let words: string[] = [];
  let word = '';
  let started = false;
  let quote = '';
  let glob = false;
  let comment = false;
  const pushWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const pushSegment = () => {
    pushWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) {
        quote = '';
        continue;
      }
      // Inside double quotes a backslash escapes only these characters; before
      // anything else it is literal. A line continuation stays opaque.
      if (quote === '"' && ch === '\\') {
        const next = text[i + 1] ?? '';
        if (/["\\$`]/.test(next)) {
          word += text[++i]!;
          continue;
        }
        if (next === '\n') return null;
        word += ch;
        continue;
      }
      if (quote === '"' && /[$`]/.test(ch)) return null;
      word += ch;
      continue;
    }
    if (!started && /[12>]/.test(ch)) {
      const discard = text.slice(i, i + 12).match(DISCARD);
      if (discard) {
        i += discard[0].length - 1;
        continue;
      }
    }
    // A shell without interactive comments treats '#' as an ordinary word.
    // Comment text with shell syntax or quotes would act there, so it stays
    // opaque; shellKind also checks the plain-word reading.
    if (comments && ch === '#' && !started) {
      const end = text.indexOf('\n', i);
      if (/[;|&$`\\()<>{}'"]/.test(text.slice(i, end === -1 ? undefined : end))) return null;
      i = end === -1 ? text.length : end - 1;
      comment = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/[*?[\]]/.test(ch)) {
      glob = true;
      word += ch;
      started = true;
      continue;
    }
    if (/[$`\\()<>{}]/.test(ch)) return null;
    if (/[;|&\n]/.test(ch)) {
      pushSegment();
      continue;
    }
    if (/\s/.test(ch)) {
      pushWord();
      continue;
    }
    word += ch;
    started = true;
  }
  if (quote) return null;
  pushSegment();
  return segments.length ? { segments, glob, comment } : null;
}

// Callers that act on exact words get no comment leniency.
export function commands(text: string) {
  const parsed = parse(text);
  return parsed && !parsed.glob && !parsed.comment ? parsed.segments : null;
}

const READERS = new Set([
  'cat',
  'head',
  'tail',
  'ls',
  'pwd',
  'wc',
  'stat',
  'file',
  'which',
  'basename',
  'dirname',
  'readlink',
  'realpath',
  'diff',
  'cmp',
  'sort',
  'uniq',
  'cut',
  'tr',
  'echo',
  'printf',
  'true',
  'false',
  'uname',
  'whoami',
  'id',
  'ps',
  'du',
  'df',
]);

// Expanded names can begin with '-', so globs are limited to readers whose
// options can neither write nor execute.
const GLOB_READERS = new Set([
  'cat',
  'head',
  'tail',
  'ls',
  'echo',
  'wc',
  'stat',
  'grep',
  'diff',
  'cmp',
  'ps',
  'du',
  'df',
]);

// Help and version output depend on the executable, so only vetted names
// qualify. The bundled flow-team skill reads Herdr's help.
const HELP_READERS = new Set([
  ...READERS,
  'git',
  'rg',
  'grep',
  'find',
  'sed',
  'jq',
  'node',
  'npm',
  'herdr',
]);

const GIT_READS = new Set([
  'status',
  'diff',
  'log',
  'show',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'blame',
  'describe',
  'version',
  'show-ref',
  'grep',
  'rev-list',
  'merge-base',
  'check-ignore',
]);

const SED_ADDRESS = '(?:[0-9]+|\\$)(?:,(?:[0-9]+|\\$))?p';
const SED_PRINT = new RegExp(`^${SED_ADDRESS}(?:;${SED_ADDRESS})*$`);

const BRANCH_LISTING = new Set([
  '-a',
  '--all',
  '-r',
  '--remotes',
  '-v',
  '-vv',
  '--list',
  '--show-current',
]);

// GNU and Git long options accept unambiguous abbreviations, so --out means --output.
const abbreviates = (arg: string, names: string[]) => {
  const name = arg.split('=')[0]!;
  return name.length > 2 && name.startsWith('--') && names.some((full) => full.startsWith(name));
};

// The selected repository's configuration can run code, so -C may only name
// the project itself.
function projectDirectory(path: string | undefined, root: string | undefined) {
  if (!path || !root || !isAbsolute(path)) return false;
  try {
    return realpathSync(path) === root;
  } catch {
    return false;
  }
}

function isRead(segment: string[], configured: ReadCommand[] = [], root?: string) {
  const [cmd, ...args] = segment;
  if (HELP_READERS.has(cmd!) && args.length === 1 && ['--help', '--version'].includes(args[0]!)) {
    return true;
  }
  if (cmd === 'command') {
    return args.length === 2 && ['-v', '-V'].includes(args[0]!) && !args[1]!.startsWith('-');
  }
  if (cmd === 'jq') {
    const filtered = ['jq'];
    for (let i = 0; i < args.length; i++) {
      if (['--arg', '--argjson'].includes(args[i]!)) {
        if (i + 2 >= args.length || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(args[i + 1]!)) return false;
        if (args[i]! === '--argjson') {
          try {
            JSON.parse(args[i + 2]!);
          } catch {
            return false;
          }
        }
        i += 2;
      } else {
        filtered.push(args[i]!);
      }
    }
    return configuredRead(
      filtered,
      {
        prefix: ['jq'],
        options: {
          '-r': 'flag',
          '--raw-output': 'flag',
          '-c': 'flag',
          '--compact-output': 'flag',
          '-s': 'flag',
          '--slurp': 'flag',
          '-n': 'flag',
          '--null-input': 'flag',
          '-e': 'flag',
          '--exit-status': 'flag',
          '-S': 'flag',
          '--sort-keys': 'flag',
        },
        positionals: { min: 1, max: Number.MAX_SAFE_INTEGER },
      },
      true,
    );
  }
  if (
    cmd === 'sort' &&
    args.some((a) => /^-[^-]*o/.test(a) || abbreviates(a, ['--output', '--compress-program']))
  ) {
    return false;
  }
  if (cmd === 'uniq') {
    return configuredRead(
      segment,
      {
        prefix: ['uniq'],
        options: {
          '-c': 'flag',
          '--count': 'flag',
          '-d': 'flag',
          '--repeated': 'flag',
          '-u': 'flag',
          '--unique': 'flag',
          '-i': 'flag',
          '--ignore-case': 'flag',
          '-z': 'flag',
          '--zero-terminated': 'flag',
          '-f': 'positiveInteger',
          '--skip-fields': 'positiveInteger',
          '-s': 'positiveInteger',
          '--skip-chars': 'positiveInteger',
        },
        positionals: { min: 0, max: 1 },
      },
      true,
    );
  } // Its second operand writes an output file.
  if (cmd === 'file' && args.some((a) => /^-[^-]*C/.test(a) || abbreviates(a, ['--compile']))) {
    return false;
  }
  if (READERS.has(cmd!)) return true;
  if (cmd === 'git') {
    const gitArgs = [...args];
    while (gitArgs.length) {
      if (['--no-pager', '--literal-pathspecs', '--no-optional-locks'].includes(gitArgs[0]!)) {
        gitArgs.shift();
        continue;
      }
      if (gitArgs[0]! === '-C') {
        if (!projectDirectory(gitArgs[1], root)) return false;
        gitArgs.splice(0, 2);
        continue;
      }
      break;
    }
    if (!gitArgs.length) return false;
    if (
      gitArgs.some((a) =>
        abbreviates(a, ['--output', '--ext-diff', '--textconv', '--open-files-in-pager']),
      )
    ) {
      return false;
    }
    if (gitArgs[0]! === 'grep' && gitArgs.some((a) => /^-[^-]*O/.test(a))) return false; // -O runs a pager command.
    if (gitArgs[0]! === 'remote') {
      return gitArgs.length === 1 || (gitArgs.length === 2 && gitArgs[1]! === '-v');
    }
    if (gitArgs[0]! === 'branch') return gitArgs.slice(1).every((a) => BRANCH_LISTING.has(a));
    return GIT_READS.has(gitArgs[0]!);
  }
  if (cmd === 'rg') return !args.some((a) => /^--(pre|hostname-bin|pre-glob)(=|$)/.test(a));
  if (cmd === 'grep') return true;
  if (cmd === 'find') {
    return !args.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint.*|fls)$/.test(a));
  }
  // GNU sed accepts options after the script, and -i or -e 'w file' writes.
  if (cmd === 'sed') {
    return (
      args[0]! === '-n' &&
      SED_PRINT.test(args[1]! ?? '') &&
      args.slice(2).every((a) => !a.startsWith('-'))
    );
  }
  // Extra flags can turn a reader into a writer (for example list + write).
  // Options must be part of the reviewed prefix; only positional operands follow.
  return configured.some((entry) => configuredRead(segment, entry));
}

function configuredRead(segment: string[], entry: ReadCommand, endOptions = false) {
  const prefix = Array.isArray(entry) ? entry : entry.prefix;
  if (!prefix.every((part, i) => segment[i]! === part)) return false;
  const args = segment.slice(prefix.length);
  if (Array.isArray(entry)) return args.every((part) => !part.startsWith('-'));
  let count = 0;
  let operands = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (endOptions && arg === '--' && !operands) {
      operands = true;
      continue;
    }
    if (operands || !arg.startsWith('-')) {
      count++;
      continue;
    }
    if (!Object.hasOwn(entry.options, arg)) return false;
    const type = entry.options[arg];
    if (type === 'flag') continue;
    const value = args[++i]!;
    if (
      !value ||
      value.startsWith('-') ||
      (type === 'positiveInteger' && !/^[1-9][0-9]*$/.test(value))
    ) {
      return false;
    }
  }
  return count >= entry.positionals.min && count <= entry.positionals.max;
}

const isCd = (segment: string[]) => segment[0]! === 'cd' && segment.length <= 2;

// A nested repository below the project supplies its own executable Git configuration.
function nestedRepository(dir: string, root: string) {
  for (let d = dir; d !== root && d.startsWith(root + '/'); d = dirname(d)) {
    if (existsSync(resolve(d, '.git'))) return true;
  }
  return false;
}

// Reads after cd run in the target directory, so another repository's
// configuration applies there just as with git -C.
function staysInProject(segments: string[][], root: string | undefined, cwd: string | undefined) {
  if (!root) return true;
  let dir = cwd ?? root;
  for (const segment of segments) {
    if (segment[0] === 'git' && nestedRepository(dir, root)) return false;
    if (!isCd(segment)) continue;
    const target = segment[1];
    if (!target || target.startsWith('-') || target.startsWith('~')) return false;
    try {
      dir = realpathSync(resolve(dir, target));
    } catch {
      return false;
    }
    if (dir !== root && !dir.startsWith(root + '/')) return false;
  }
  return true;
}

function leavesBranch(segment: string[]) {
  if (segment[0]! !== 'git') return false;
  const [verb, ...args] = segment.slice(1);
  if (!['checkout', 'switch'].includes(verb!) || args.includes('--')) return false;
  if (args.length === 1) return /^[A-Za-z0-9][\w./-]*$/.test(args[0]!);
  return (
    args.length === 2 && ['-b', '-c'].includes(args[0]!) && /^[A-Za-z0-9][\w./-]*$/.test(args[1]!)
  );
}

export function shellKind(
  text: string,
  readCommands: ReadCommand[],
  root?: string,
  cwd?: string,
): ShellKind {
  const parsed = parse(text);
  if (!parsed) return 'opaque';
  if (!parsed.comment) return classify(parsed, readCommands, root, cwd);
  // A commented command is a read only if it also reads when '#' is a plain
  // word: trailing comment words become arguments, and a segment starting
  // with '#' is a missing command that runs nothing. Never a branch exemption.
  if (classify(parsed, readCommands, root, cwd) !== 'read') return 'mutation';
  const plain = parse(text, false);
  const segments = plain?.segments.filter((segment) => !segment[0]!.startsWith('#'));
  return plain &&
    segments?.length &&
    classify({ ...plain, segments }, readCommands, root, cwd) === 'read'
    ? 'read'
    : 'opaque';
}

function classify(
  { segments, glob }: { segments: string[][]; glob: boolean },
  readCommands: ReadCommand[],
  root?: string,
  cwd?: string,
): ShellKind {
  const contained = staysInProject(segments, root, cwd);
  if (glob) {
    return contained &&
      segments.every((s) => {
        if (isCd(s) || GLOB_READERS.has(s[0]!)) return true;
        // Path-prefixed patterns cannot expand into options. Bare patterns need --.
        const delimiter = s.indexOf('--');
        // Only recognize a delimiter after operands or known argument-free flags.
        const flags = new Set([
          '-n',
          '--line-number',
          '--no-pager',
          '--literal-pathspecs',
          '--no-optional-locks',
        ]);
        const endOptions =
          s[0]! !== 'find' &&
          delimiter > 0 &&
          s.slice(1, delimiter).every((arg) => !arg.startsWith('-') || flags.has(arg))
            ? delimiter
            : -1;
        const safe = s.every(
          (arg, i) =>
            !/[*?[\]]/.test(arg) ||
            (i > 0 &&
              ((endOptions > 0 && i > endOptions) ||
                arg.slice(0, arg.search(/[*?[\]]/)).includes('/'))),
        );
        // Only built-ins with safe multiple operands: expansion can multiply arguments.
        return (
          ['rg', 'find', 'git', 'sort', 'sed'].includes(s[0]!) &&
          safe &&
          isRead(s, readCommands, root)
        );
      })
      ? 'read'
      : 'opaque';
  }
  if (contained && segments.every((s) => isCd(s) || isRead(s, readCommands, root))) return 'read';
  if (
    segments.some(leavesBranch) &&
    segments.every((s) => leavesBranch(s) || isRead(s, readCommands, root))
  ) {
    return 'branch';
  }
  return 'mutation';
}
