import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';

type ExecFileOptions = { cwd?: string; env?: NodeJS.ProcessEnv };
type ExecFileAsync = (
  command: string,
  args: string[],
  options?: ExecFileOptions,
) => Promise<{ stdout: string; stderr: string }>;

const promisifiedExecFile = promisify(execFile);

async function defaultExecFileAsync(
  command: string,
  args: string[],
  options?: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await promisifiedExecFile(command, args, options);
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

function defaultCheckoutPath(): string {
  let current = fileURLToPath(new URL('.', import.meta.url));
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}

const TOOL_CANDIDATE_PATHS: Record<'git' | 'yarn', string[]> = {
  git: ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'],
  yarn: ['/usr/local/bin/yarn', '/opt/homebrew/bin/yarn', '/opt/homebrew/opt/yarn/bin/yarn'],
};

const AUGMENTED_PATH_DIRECTORIES = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];

export interface SourceCheckoutUpdateCliDependencies {
  checkoutPath: string;
  execFileAsync: ExecFileAsync;
  existsSyncImpl: (path: string) => boolean;
}

function createDefaultDependencies(): SourceCheckoutUpdateCliDependencies {
  return {
    checkoutPath: defaultCheckoutPath(),
    execFileAsync: defaultExecFileAsync,
    existsSyncImpl: existsSync,
  };
}

export class SourceCheckoutUpdateCliGateway implements SourceCheckoutUpdateGateway {
  private readonly dependencies: SourceCheckoutUpdateCliDependencies;

  constructor(dependencies?: SourceCheckoutUpdateCliDependencies) {
    this.dependencies = dependencies ?? createDefaultDependencies();
  }

  async getCurrentBranch(): Promise<string> {
    const gitPath = await this.resolveRequiredToolPath('git');
    const { stdout } = await this.dependencies.execFileAsync(
      gitPath,
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: this.dependencies.checkoutPath },
    );
    return stdout.trim();
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const gitPath = await this.resolveRequiredToolPath('git');
    const { stdout } = await this.dependencies.execFileAsync(gitPath, ['status', '--porcelain'], {
      cwd: this.dependencies.checkoutPath,
    });
    return stdout.trim().length > 0;
  }

  async resolveToolPath(tool: 'git' | 'yarn'): Promise<string | null> {
    const candidate = TOOL_CANDIDATE_PATHS[tool].find((path) =>
      this.dependencies.existsSyncImpl(path),
    );
    if (candidate !== undefined) {
      return candidate;
    }

    return this.resolveToolPathFromAugmentedPath(tool);
  }

  async fetchLatest(): Promise<{ success: boolean; error: string | null }> {
    try {
      const gitPath = await this.resolveRequiredToolPath('git');
      await this.dependencies.execFileAsync(gitPath, ['pull'], {
        cwd: this.dependencies.checkoutPath,
      });
      return { success: true, error: null };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async rebuild(): Promise<{ success: boolean; error: string | null }> {
    try {
      const yarnPath = await this.resolveRequiredToolPath('yarn');
      await this.dependencies.execFileAsync(yarnPath, ['build'], {
        cwd: this.dependencies.checkoutPath,
      });
      return { success: true, error: null };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async resolveToolPathFromAugmentedPath(tool: 'git' | 'yarn'): Promise<string | null> {
    const augmentedPath = [...AUGMENTED_PATH_DIRECTORIES, process.env.PATH ?? ''].join(':');
    try {
      const { stdout } = await this.dependencies.execFileAsync('which', [tool], {
        cwd: this.dependencies.checkoutPath,
        env: { ...process.env, PATH: augmentedPath },
      });
      const resolved = stdout.trim();
      return resolved.length > 0 ? resolved : null;
    } catch {
      return null;
    }
  }

  private async resolveRequiredToolPath(tool: 'git' | 'yarn'): Promise<string> {
    const resolved = await this.resolveToolPath(tool);
    return resolved ?? tool;
  }
}
