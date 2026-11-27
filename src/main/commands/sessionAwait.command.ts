import { loadReviewOrchestrationSettings } from '@/config/projectConfig.js';
import { createRoleSessionGateways, oneLine } from '@/main/commands/session.command.js';
import {
  AwaitRoleSessionsUseCase,
  type RoleSessionOutcome,
} from '@/modules/claude-invocation/usecases/awaitRoleSessions.usecase.js';

const AWAIT_USAGE = 'reviewflow session await --job <jobId> [--max-wait <seconds>]';
const AWAIT_POLL_INTERVAL_MS = 10_000;
const SECOND_MS = 1000;

export interface SessionAwaitDependencies {
  awaitRoleSessions: AwaitRoleSessionsUseCase;
  print: (line: string) => void;
  exit: (code: number) => void;
}

const VERDICT_LABELS: Record<RoleSessionOutcome['verdict'], string> = {
  done: 'DONE',
  failed: 'FAILED',
  timeout: 'TIMEOUT',
};

type MaxWait = { readable: true; maxWaitMs: number | null } | { readable: false };

function maxWaitOf(seconds: string | null): MaxWait {
  if (seconds === null) return { readable: true, maxWaitMs: null };
  if (!/^\d+$/.test(seconds)) return { readable: false };
  return { readable: true, maxWaitMs: Number(seconds) * SECOND_MS };
}

export async function executeSessionAwait(
  options: { job: string | null; maxWait: string | null },
  dependencies: SessionAwaitDependencies,
): Promise<void> {
  const refuse = (reason: string): void => {
    dependencies.print(`ERROR ${oneLine(reason)}`);
    dependencies.exit(1);
  };
  if (options.job === null) {
    refuse(`missing --job (usage: ${AWAIT_USAGE})`);
    return;
  }
  const maxWait = maxWaitOf(options.maxWait);
  if (!maxWait.readable) {
    refuse(`--max-wait must be a whole number of seconds, got "${options.maxWait}"`);
    return;
  }
  const result = await dependencies.awaitRoleSessions.execute({
    jobId: options.job,
    maxWaitMs: maxWait.maxWaitMs,
  });
  if (result.status === 'refused') {
    refuse(result.reason);
    return;
  }
  result.outcomes.forEach((outcome) =>
    dependencies.print(`${VERDICT_LABELS[outcome.verdict]} ${outcome.role} ${outcome.sessionId}`),
  );
  dependencies.exit(0);
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((wakeUp) => setTimeout(wakeUp, milliseconds));
}

export function createSessionAwaitDependencies(): SessionAwaitDependencies {
  return {
    awaitRoleSessions: new AwaitRoleSessionsUseCase({
      ...createRoleSessionGateways(),
      reviewSettingsOf: loadReviewOrchestrationSettings,
      wait: pause,
      pollIntervalMs: AWAIT_POLL_INTERVAL_MS,
    }),
    print: console.log,
    exit: process.exit,
  };
}
