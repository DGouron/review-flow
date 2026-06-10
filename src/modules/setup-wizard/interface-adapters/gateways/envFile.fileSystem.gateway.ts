import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  EnvFileGateway,
  EnvFileContents,
} from '@/modules/setup-wizard/entities/envFile/envFile.gateway.js';

const ENV_FILENAME = '.env';
const GITIGNORE_FILENAME = '.gitignore';
const GITLAB_KEY = 'GITLAB_WEBHOOK_TOKEN';
const GITHUB_KEY = 'GITHUB_WEBHOOK_SECRET';

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex < 0) return null;
  return {
    key: trimmed.slice(0, equalsIndex).trim(),
    value: trimmed.slice(equalsIndex + 1).trim(),
  };
}

export class EnvFileFileSystemGateway implements EnvFileGateway {
  read(projectPath: string): EnvFileContents {
    const path = join(projectPath, ENV_FILENAME);
    if (!existsSync(path)) {
      return { gitlabSecret: null, githubSecret: null };
    }
    const raw = readFileSync(path, 'utf-8');
    let gitlabSecret: string | null = null;
    let githubSecret: string | null = null;
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (parsed.key === GITLAB_KEY) gitlabSecret = parsed.value;
      if (parsed.key === GITHUB_KEY) githubSecret = parsed.value;
    }
    return { gitlabSecret, githubSecret };
  }

  write(projectPath: string, contents: EnvFileContents): void {
    const path = join(projectPath, ENV_FILENAME);
    const lines = [
      `${GITLAB_KEY}=${contents.gitlabSecret ?? ''}`,
      `${GITHUB_KEY}=${contents.githubSecret ?? ''}`,
      '',
    ];
    writeFileSync(path, lines.join('\n'), 'utf-8');
  }

  ensureGitignored(projectPath: string): void {
    const gitignorePath = join(projectPath, GITIGNORE_FILENAME);
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, `${ENV_FILENAME}\n`, 'utf-8');
      return;
    }
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(ENV_FILENAME)) return;
    appendFileSync(gitignorePath, `${ENV_FILENAME}\n`, 'utf-8');
  }
}
