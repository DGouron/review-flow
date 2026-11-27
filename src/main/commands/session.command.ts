import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadReviewOrchestrationSettings } from '@/config/projectConfig.js';
import { defaultProcessRunner } from '@/frameworks/claude/claudeInvoker.js';
import { ClaudeSessionCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { RoleSessionClaudeCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSession.claude.cli.gateway.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { LaunchRoleSessionUseCase } from '@/modules/claude-invocation/usecases/launchRoleSession.usecase.js';
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

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function createSessionLaunchDependencies(): SessionLaunchDependencies {
  const runner = defaultProcessRunner();
  return {
    launchRoleSession: new LaunchRoleSessionUseCase({
      roleSessionGateway: new RoleSessionClaudeCliGateway(runner),
      roleSessionJobGateway: new RoleSessionJobFileSystemGateway(jobContextDirectory()),
      sessionGateway: new ClaudeSessionCliGateway(runner),
      reviewSettingsOf: loadReviewOrchestrationSettings,
      now: () => new Date(),
    }),
    readBrief: (path) => readFileOrNull(resolve(path)),
    print: console.log,
    exit: process.exit,
  };
}
