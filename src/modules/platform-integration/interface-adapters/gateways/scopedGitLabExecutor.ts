import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import {
  buildScopedExecutorEnvironment,
  type ExecutorFileWriter,
  type ScopedExecutorEnv,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type ScopedSpawn = (command: string, env: ScopedExecutorEnv, cwd: string) => string;

export type ScopedArgvSpawn = (
  command: string,
  args: string[],
  env: ScopedExecutorEnv,
  cwd: string,
) => string;

export interface CreateScopedGitLabExecutorInput {
  parentEnv: Record<string, string | undefined>;
  isolatedDir: string;
  fileWriter: ExecutorFileWriter;
  spawn: ScopedSpawn;
}

export interface CreateScopedGitLabArgvExecutorInput {
  parentEnv: Record<string, string | undefined>;
  isolatedDir: string;
  fileWriter: ExecutorFileWriter;
  spawn: ScopedArgvSpawn;
}

interface ScopedTarget {
  env: ScopedExecutorEnv;
  cwd: string;
}

interface ScopedTargetInput {
  parentEnv: Record<string, string | undefined>;
  isolatedDir: string;
  fileWriter: ExecutorFileWriter;
}

function buildScopedTarget(input: ScopedTargetInput): ScopedTarget {
  const { env } = buildScopedExecutorEnvironment({
    parentEnv: input.parentEnv,
    isolatedDir: input.isolatedDir,
    fileWriter: input.fileWriter,
  });

  return { env, cwd: env.HOME ?? input.isolatedDir };
}

/**
 * Builds a CommandExecutor whose GitLab credential is a dedicated service token (AC1,
 * fail-closed at construction), whose process env is an allowlist with the token never
 * present (AC2/AC3), and which runs against an isolated HOME/GLAB_CONFIG_DIR holding the
 * token in its own glab config file (AC4). Never inherits the ambient admin token.
 */
export function createScopedGitLabExecutor(
  input: CreateScopedGitLabExecutorInput,
): CommandExecutor {
  const { env, cwd } = buildScopedTarget(input);

  return (command: string): string => input.spawn(command, env, cwd);
}

/**
 * Same isolation as createScopedGitLabExecutor, for callers whose arguments carry
 * attacker-influenceable values: command and arguments stay separate, so the spawn needs no
 * shell and no value can escape a quoting context.
 */
export function createScopedGitLabArgvExecutor(
  input: CreateScopedGitLabArgvExecutorInput,
): ArgvCommandExecutor {
  const { env, cwd } = buildScopedTarget(input);

  return (command: string, args: string[]): string => input.spawn(command, args, env, cwd);
}
