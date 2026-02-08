import { execSync } from 'node:child_process';

interface DependencyInfo {
  name: string;
  command: string;
  installUrl: string;
}

const REQUIRED_DEPENDENCIES: DependencyInfo[] = [
  {
    name: 'Claude Code CLI',
    command: 'claude --version',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  },
  {
    name: 'GitLab CLI (glab)',
    command: 'glab version',
    installUrl: 'https://gitlab.com/gitlab-org/cli#installation',
  },
  {
    name: 'GitHub CLI (gh)',
    command: 'gh --version',
    installUrl: 'https://cli.github.com/',
  },
];

export function checkDependency(dep: { name: string; command: string }): boolean {
  try {
    execSync(dep.command, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function validateDependencies(): DependencyInfo[] {
  const missing: DependencyInfo[] = [];
  for (const dep of REQUIRED_DEPENDENCIES) {
    if (!checkDependency(dep)) {
      missing.push(dep);
    }
  }
  return missing;
}
