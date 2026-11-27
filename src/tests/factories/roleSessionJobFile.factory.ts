export interface RoleSessionJobFileOverrides {
  jobId?: string;
  localPath?: string;
  worktreePath?: string;
  jobType?: 'review' | 'followup';
  mrNumber?: number;
  roleSessions?: Array<{ sessionId: string; role: string; launchedAt: string }>;
}

/** The job file as the server writes it in ~/.claude-review/jobs while a review runs. */
export const RoleSessionJobFileFactory = {
  create(overrides: RoleSessionJobFileOverrides = {}): Record<string, unknown> {
    const file: Record<string, unknown> = {
      jobId: overrides.jobId ?? 'github:acme/app:2111',
      localPath: overrides.localPath ?? '/home/ai/projects/acme-app',
      mergeRequestId: 'github-acme/app-2111',
      jobType: overrides.jobType ?? 'review',
      platform: 'github',
      projectPath: 'acme/app',
      sourceBranch: 'feat/checkout',
      targetBranch: 'master',
      timestamp: '2026-11-27T08:55:00.000Z',
      mrNumber: overrides.mrNumber ?? 2111,
      worktreePath: overrides.worktreePath ?? '/home/ai/.reviewflow/worktrees/github-acme-app-2111',
    };
    if (overrides.roleSessions !== undefined) {
      file.roleSessions = overrides.roleSessions;
    }
    return file;
  },
};
