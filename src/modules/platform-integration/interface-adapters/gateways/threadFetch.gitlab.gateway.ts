import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import { createScopedGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/scopedGitLabExecutor.js';
import type {
  ExecutorFileWriter,
  ScopedExecutorEnv,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export type CommandExecutor = (command: string) => string;

const realFileWriter: ExecutorFileWriter = {
  write(path: string, contents: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, { mode: 0o600 });
  },
  ensureDir(path: string): void {
    mkdirSync(path, { recursive: true });
  },
};

const scopedSpawn = (command: string, env: ScopedExecutorEnv, cwd: string): string =>
  execSync(command, { encoding: 'utf-8', timeout: 30000, env, cwd });

let scopedExecutor: CommandExecutor | null = null;

/**
 * Fail-closed scoped GitLab executor (SPEC-196 AC1-AC4). Built lazily on first use so the
 * dedicated service token is read at construction time; if absent it throws and no job is
 * started. The token never enters the child env (AC3); it lives in an isolated glab config
 * file under a per-process HOME/GLAB_CONFIG_DIR (AC4). Never inherits the ambient admin token.
 */
export const defaultGitLabExecutor: CommandExecutor = (command: string): string => {
  if (scopedExecutor === null) {
    const isolatedDir = `${tmpdir()}/reviewflow-executor-${process.pid}`;
    scopedExecutor = createScopedGitLabExecutor({
      parentEnv: process.env,
      isolatedDir,
      fileWriter: realFileWriter,
      spawn: scopedSpawn,
    });
  }
  return scopedExecutor(command);
};

interface GitLabNotePosition {
  new_path: string | null;
  new_line: number | null;
}

interface GitLabNote {
  resolvable: boolean;
  resolved: boolean;
  body: string;
  position: GitLabNotePosition | null;
}

interface GitLabDiscussion {
  id: string;
  notes: GitLabNote[];
}

export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[] {
    const encodedProject = projectPath.replace(/\//g, '%2F');
    const response = this.executor(
      `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/discussions`,
    );
    const discussions: GitLabDiscussion[] = JSON.parse(response);

    const threads: ReviewContextThread[] = [];

    for (const discussion of discussions) {
      const firstNote = discussion.notes[0];
      if (!firstNote?.resolvable) continue;

      threads.push({
        id: discussion.id,
        file: firstNote.position?.new_path ?? null,
        line: firstNote.position?.new_line ?? null,
        status: firstNote.resolved ? 'resolved' : 'open',
        body: firstNote.body,
      });
    }

    return threads;
  }
}
