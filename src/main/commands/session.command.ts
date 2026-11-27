import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadReviewOrchestrationSettings } from '@/config/projectConfig.js';
import { defaultProcessRunner } from '@/frameworks/claude/claudeInvoker.js';
import { ClaudeSessionCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { RoleSessionClaudeCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSession.claude.cli.gateway.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import {
  EndRoleSessionUseCase,
  type RoleSessionCleanupDependencies,
} from '@/modules/claude-invocation/usecases/endRoleSession.usecase.js';
import { LaunchRoleSessionUseCase } from '@/modules/claude-invocation/usecases/launchRoleSession.usecase.js';
import {
  SweepRoleSessionsUseCase,
  type SweepAction,
  type SweepOutcome,
} from '@/modules/claude-invocation/usecases/sweepRoleSessions.usecase.js';
import { WORKTREE_BASE_DIR } from '@/shared/services/daemonPaths.js';
import { jobContextDirectory } from '@/shared/services/mcpJobContext.js';

const LAUNCH_USAGE = 'reviewflow session launch --role <role> --brief <file> --job <jobId>';

export interface SessionLaunchOptions {
  role: string | null;
  brief: string | null;
  job: string | null;
}

export interface SessionLaunchDependencies {
  launchRoleSession: LaunchRoleSessionUseCase;
  readBrief: (path: string) => string | null;
  print: (line: string) => void;
  exit: (code: number) => void;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

type RequiredLaunchOptions = { role: string; briefPath: string; jobId: string };

function requiredOptionsOf(
  options: SessionLaunchOptions,
): RequiredLaunchOptions | { missing: string } {
  if (options.role === null) return { missing: '--role' };
  if (options.brief === null) return { missing: '--brief' };
  if (options.job === null) return { missing: '--job' };
  return { role: options.role, briefPath: options.brief, jobId: options.job };
}

export async function executeSessionLaunch(
  options: SessionLaunchOptions,
  dependencies: SessionLaunchDependencies,
): Promise<void> {
  const refuse = (reason: string): void => {
    dependencies.print(`ERROR ${oneLine(reason)}`);
    dependencies.exit(1);
  };
  const required = requiredOptionsOf(options);
  if ('missing' in required) {
    refuse(`missing ${required.missing} (usage: ${LAUNCH_USAGE})`);
    return;
  }
  const brief = dependencies.readBrief(required.briefPath);
  if (brief === null) {
    refuse(`brief ${required.briefPath} cannot be read`);
    return;
  }
  const result = await dependencies.launchRoleSession.execute({
    role: required.role,
    brief,
    jobId: required.jobId,
  });
  if (result.status === 'refused') {
    refuse(result.reason);
    return;
  }
  dependencies.print(`LAUNCHED ${result.sessionId} ${result.name}`);
  dependencies.exit(0);
}

export interface SessionCleanupDependencies {
  endRoleSession: EndRoleSessionUseCase;
  sweepRoleSessions: SweepRoleSessionsUseCase;
  print: (line: string) => void;
  exit: (code: number) => void;
}

const SWEEP_ACTION_LABELS: Record<SweepAction, string> = {
  removed: 'REMOVED',
  'would-remove': 'WOULD-REMOVE',
  kept: 'KEPT',
  failed: 'FAILED',
};

function sweepLineOf(outcome: SweepOutcome): string {
  const words = [SWEEP_ACTION_LABELS[outcome.action], outcome.sessionId, outcome.name];
  return `${words.filter((word) => word !== null).join(' ')} (${oneLine(outcome.reason)})`;
}

export async function executeSessionEnd(
  options: { sessionId: string | null },
  dependencies: SessionCleanupDependencies,
): Promise<void> {
  const { print, exit } = dependencies;
  if (options.sessionId === null) {
    print('ERROR missing session id (usage: reviewflow session end <id>)');
    exit(1);
    return;
  }
  const result = await dependencies.endRoleSession.execute({ sessionId: options.sessionId });
  if (result.status === 'failed') {
    print(`ERROR ${oneLine(result.reason)}`);
    exit(1);
    return;
  }
  print(
    result.status === 'removed' ? `REMOVED ${result.name}` : `ALREADY-GONE ${options.sessionId}`,
  );
  exit(0);
}

export async function executeSessionSweep(
  options: { dryRun: boolean },
  dependencies: SessionCleanupDependencies,
): Promise<void> {
  const result = await dependencies.sweepRoleSessions.execute({ dryRun: options.dryRun });
  if (result.status === 'failed') {
    dependencies.print(`ERROR ${oneLine(result.reason)}`);
    dependencies.exit(1);
    return;
  }
  result.outcomes.forEach((outcome) => dependencies.print(sweepLineOf(outcome)));
  dependencies.exit(result.outcomes.some((outcome) => outcome.action === 'failed') ? 1 : 0);
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function createRoleSessionGateways(): RoleSessionCleanupDependencies {
  const runner = defaultProcessRunner();
  return {
    roleSessionGateway: new RoleSessionClaudeCliGateway(runner),
    roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobContextDirectory()),
    sessionGateway: new ClaudeSessionCliGateway(runner),
    worktreeRoot: WORKTREE_BASE_DIR,
    now: () => new Date(),
  };
}

export function createSessionLaunchDependencies(): SessionLaunchDependencies {
  return {
    launchRoleSession: new LaunchRoleSessionUseCase({
      ...createRoleSessionGateways(),
      reviewSettingsOf: loadReviewOrchestrationSettings,
    }),
    readBrief: (path) => readFileOrNull(resolve(path)),
    print: console.log,
    exit: process.exit,
  };
}

export function createSessionCleanupDependencies(): SessionCleanupDependencies {
  const gateways = createRoleSessionGateways();
  return {
    endRoleSession: new EndRoleSessionUseCase(gateways),
    sweepRoleSessions: new SweepRoleSessionsUseCase(gateways),
    print: console.log,
    exit: process.exit,
  };
}
