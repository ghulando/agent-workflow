#!/usr/bin/env node
import { parseCommand } from '../core/cli.js';
import { runGate } from '../core/runtime.js';

const help = `agent-workflow commands:
  install-plan <repo> [--repair]    Preview project installation
  install <repo> [--repair]         Install repo adapters, preserving settings
  install-user                    Preview personal installation
  install-user --repair            Preview same-version content repair
  install-user --repair --apply    Repair a same-version content mismatch
  install-user --apply             Apply the personal installation
  setup <repo>                     Print a read-only setup proposal as JSON
  setup-apply <repo> <proposal>     Apply a reviewed, current proposal
  task-start <id> <title> --author pi|codex|claude [--fix] [--small]
  task-resume <task-file>           Read portable task and current worktree
  task-handoff <task-file> --author pi|codex|claude
  review <task-file> --author pi|codex|claude --reviewer claude|codex|ollama --round <number> --gate-session <session-key>
  review <task-file> --author pi|codex|claude --reviewer pi|codex|claude --round <number> --gate-session <session-key> --pane
                                    Record a team pane's <reviewer>-verdict-round<N>.json
  doctor [--author pi|codex|claude] Diagnose configuration and install drift
  review-recover <task-file>       Recover a stopped review without erasing reports
  review-recover <task-file> --stopped-reviewer  Attest a stopped reviewer with missing PID
  review-status <task-file>         Show recorded independent reviews
  gate <session-key>               Run configured checks for this session
  history-plan --harness claude,pi,codex|all  Preview history and save a private plan
  history-digest --harness claude,pi,codex|all  Print compact session digests
  history-clean <plan-file> --confirm DELETE  Delete reviewed entries, skipping changed ones
`;

const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(help);
  } else {
    const { positional, flags } = parseCommand(command, args);
    switch (command) {
      case 'history-plan':
      case 'history-digest':
      case 'history-clean': {
        const { planClean, saveCleanPlan, digestHistory, applyClean, historyHarnesses } =
          await import('../core/clean-history.js');
        if (command === 'history-clean') {
          print(applyClean(positional[0]!, flags.confirm as string));
        } else if (command === 'history-digest') {
          print(await digestHistory({ harnesses: historyHarnesses(flags.harness as string) }));
        } else {
          const plan = planClean({ harnesses: historyHarnesses(flags.harness as string) });
          print({ ...plan, planFile: saveCleanPlan(plan) });
        }
        break;
      }
      case 'gate':
        await runGate(process.cwd(), positional[0]!);
        break;
      case 'install':
      case 'install-plan': {
        const { install, installPlan } = await import('../core/install.js');
        if (command === 'install-plan') {
          print(installPlan(positional[0]!, flags));
        } else {
          install(positional[0]!, flags);
        }
        break;
      }
      case 'install-user': {
        const { personalInstallPlan, installPersonal } =
          await import('../core/personal-install.js');
        const options = { repair: flags.repair as boolean | undefined };
        print(
          flags.apply
            ? installPersonal(undefined, undefined, options)
            : personalInstallPlan(undefined, undefined, options),
        );
        break;
      }
      case 'setup': {
        const { proposeSetup } = await import('../core/setup.js');
        print(proposeSetup(positional[0]!));
        break;
      }
      case 'setup-apply': {
        const { applySetup } = await import('../core/setup.js');
        print(applySetup(positional[0]!, positional[1]!));
        break;
      }
      case 'doctor': {
        const { doctor } = await import('../core/doctor.js');
        const result = doctor(process.cwd(), flags.author as string);
        print(result);
        if (result.issues.length) process.exitCode = 1;
        break;
      }
      case 'task-start': {
        const { startTask } = await import('../core/tasks.js');
        print(
          startTask(process.cwd(), {
            id: positional[0]!,
            title: positional[1]!,
            ...flags,
            author: flags.author as string,
          }),
        );
        break;
      }
      case 'task-resume': {
        const { resumeTask } = await import('../core/tasks.js');
        print(resumeTask(process.cwd(), positional[0]!));
        break;
      }
      case 'task-handoff': {
        const { handoffTask } = await import('../core/tasks.js');
        print(handoffTask(process.cwd(), positional[0]!, flags.author as string));
        break;
      }
      case 'review': {
        const { runReview } = await import('../core/review.js');
        const result = await runReview(process.cwd(), positional[0]!, {
          ...flags,
          author: flags.author as string,
          reviewer: flags.reviewer as string,
          round: Number(flags.round),
          gateSession: flags['gate-session'] as string,
        });
        print(result);
        if (result.verdict !== 'pass') process.exitCode = 2;
        break;
      }
      case 'review-recover': {
        const { recoverReview } = await import('../core/review.js');
        print(
          await recoverReview(process.cwd(), positional[0]!, {
            stoppedReviewer: flags['stopped-reviewer'] as boolean | undefined,
          }),
        );
        break;
      }
      case 'review-status': {
        const { loadProject } = await import('../core/project.js');
        const { readTask } = await import('../core/tasks.js');
        const { reviewKey } = await import('../core/review.js');
        const { withState } = await import('../core/state.js');
        const project = loadProject(process.cwd());
        const task = readTask(project, positional[0]!);
        print(
          await withState(project.root, reviewKey(task), (state) => ({
            first: state.first ?? null,
            second: state.second ?? null,
            history: state.history ?? [],
            extraReviews: state.extraReviews ?? [],
            additionalReviewAuthorization: state.additionalReviewAuthorization ?? null,
            running: state.running ?? null,
          })),
        );
        break;
      }
    }
  }
} catch (err) {
  process.stderr.write(`agent-workflow: ${(err as Error).message}\n`);
  process.exitCode = 1;
}
