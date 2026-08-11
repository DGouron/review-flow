import { execSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import {
  createScopedGitLabArgvExecutor,
  createScopedGitLabExecutor,
} from '@/modules/platform-integration/interface-adapters/gateways/scopedGitLabExecutor.js';
import type {
  ExecutorFileWriter,
  ScopedExecutorEnv,
} from '@/modules/platform-integration/services/scopedExecutorEnvironment.js';
import type {
  ReviewContextThread,
  ReviewContextThreadComment,
} from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';

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

const scopedArgvSpawn = (
  command: string,
  args: string[],
  env: ScopedExecutorEnv,
  cwd: string,
): string => execFileSync(command, args, { encoding: 'utf-8', timeout: 30000, env, cwd });

let scopedExecutor: CommandExecutor | null = null;
let scopedArgvExecutor: ArgvCommandExecutor | null = null;

const isolatedExecutorDir = (): string => `${tmpdir()}/reviewflow-executor-${process.pid}`;

/**
 * Fail-closed scoped GitLab executor (SPEC-196 AC1-AC4). Built lazily on first use so the
 * dedicated service token is read at construction time; if absent it throws and no job is
 * started. The token never enters the child env (AC3); it lives in an isolated glab config
 * file under a per-process HOME/GLAB_CONFIG_DIR (AC4). Never inherits the ambient admin token.
 */
export const defaultGitLabExecutor: CommandExecutor = (command: string): string => {
  if (scopedExecutor === null) {
    scopedExecutor = createScopedGitLabExecutor({
      parentEnv: process.env,
      isolatedDir: isolatedExecutorDir(),
      fileWriter: realFileWriter,
      spawn: scopedSpawn,
    });
  }
  return scopedExecutor(command);
};

/**
 * Shell-free variant of defaultGitLabExecutor, with the same fail-closed token isolation.
 * Used where arguments carry values from the webhook payload.
 */
export const defaultGitLabArgvExecutor: ArgvCommandExecutor = (
  command: string,
  args: string[],
): string => {
  if (scopedArgvExecutor === null) {
    scopedArgvExecutor = createScopedGitLabArgvExecutor({
      parentEnv: process.env,
      isolatedDir: isolatedExecutorDir(),
      fileWriter: realFileWriter,
      spawn: scopedArgvSpawn,
    });
  }
  return scopedArgvExecutor(command, args);
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
  author?: { username: string } | null;
  created_at?: string;
}

interface GitLabDiscussion {
  id: string;
  notes: GitLabNote[];
}

function toComment(note: GitLabNote): ReviewContextThreadComment {
  return {
    author: note.author?.username ?? null,
    body: note.body,
    createdAt: note.created_at ?? '',
  };
}

export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  constructor(private readonly executor: ArgvCommandExecutor) {}

  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[] {
    const encodedProject = projectPath.replace(/\//g, '%2F');
    const response = this.executor('glab', [
      'api',
      `projects/${encodedProject}/merge_requests/${mergeRequestNumber}/discussions`,
    ]);
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
        comments: discussion.notes.map(toComment),
      });
    }

    return threads;
  }
}
