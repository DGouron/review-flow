import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import {
  buildScopedExecutorEnvironment,
  type ExecutorFileWriter,
  type ScopedExecutorEnv,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';

export type ScopedSpawn = (command: string, env: ScopedExecutorEnv, cwd: string) => string;

export interface CreateScopedGitLabExecutorInput {
  parentEnv: Record<string, string | undefined>;
  isolatedDir: string;
  fileWriter: ExecutorFileWriter;
  spawn: ScopedSpawn;
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
  const { env } = buildScopedExecutorEnvironment({
    parentEnv: input.parentEnv,
    isolatedDir: input.isolatedDir,
    fileWriter: input.fileWriter,
  });

  const cwd = env.HOME ?? input.isolatedDir;

  return (command: string): string => input.spawn(command, env, cwd);
}
