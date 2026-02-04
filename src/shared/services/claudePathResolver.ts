import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let cachedClaudePath: string | null = null;

function findViaWhich(): string | null {
  try {
    const result = execSync('which claude', { encoding: 'utf-8' });
    const path = result.trim();
    if (existsSync(path)) {
      return path;
    }
  } catch {
    // which failed, try other methods
  }
  return null;
}

function findInNvmVersions(): string | null {
  const nvmDir = join(homedir(), '.nvm', 'versions', 'node');
  try {
    const versions = readdirSync(nvmDir);
    for (const version of versions) {
      const claudePath = join(nvmDir, version, 'bin', 'claude');
      if (existsSync(claudePath)) {
        return claudePath;
      }
    }
  } catch {
    // nvm dir doesn't exist or not readable
  }
  return null;
}

function findInCommonPaths(): string | null {
  const commonPaths = [
    join(homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

export function resolveClaudePath(): string {
  if (cachedClaudePath) {
    return cachedClaudePath;
  }

  const path = findViaWhich() ?? findInNvmVersions() ?? findInCommonPaths();

  if (path) {
    cachedClaudePath = path;
    return path;
  }

  return 'claude';
}

export function clearClaudePathCache(): void {
  cachedClaudePath = null;
}
