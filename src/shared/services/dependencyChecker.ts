import { execSync } from 'node:child_process';

interface DependencyInfo {
  name: string;
  command: string;
  installUrl: string;
}

type CommandExecutor = (command: string, options?: object) => Buffer | string;

type Platform = 'gitlab' | 'github';

const CLAUDE_DEPENDENCY: DependencyInfo = {
  name: 'Claude Code CLI',
  command: 'claude --version',
  installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
};

const PLATFORM_DEPENDENCIES: Record<Platform, DependencyInfo> = {
  gitlab: {
    name: 'GitLab CLI (glab)',
    command: 'glab version',
    installUrl: 'https://gitlab.com/gitlab-org/cli#installation',
  },
  github: {
    name: 'GitHub CLI (gh)',
    command: 'gh --version',
    installUrl: 'https://cli.github.com/',
  },
};

function requiredDependencies(platforms: Platform[]): DependencyInfo[] {
  const required = [CLAUDE_DEPENDENCY];

  for (const platform of ['gitlab', 'github'] as const) {
    if (platforms.includes(platform)) {
      required.push(PLATFORM_DEPENDENCIES[platform]);
    }
  }

  return required;
}

export function checkDependency(
  dep: { name: string; command: string },
  executor: CommandExecutor = execSync,
): boolean {
  try {
    executor(dep.command, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * A GitHub-only install must never be blocked by a missing `glab`, nor a GitLab-only install
 * by a missing `gh`: only the CLIs of the platforms actually configured are required.
 */
export function validateDependencies(
  platforms: Platform[],
  executor: CommandExecutor = execSync,
): DependencyInfo[] {
  const missing: DependencyInfo[] = [];
  for (const dep of requiredDependencies(platforms)) {
    if (!checkDependency(dep, executor)) {
      missing.push(dep);
    }
  }
  return missing;
}
