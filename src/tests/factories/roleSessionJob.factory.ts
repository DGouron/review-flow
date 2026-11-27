import type { RoleSessionJob } from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';

export class RoleSessionJobFactory {
  static create(overrides?: Partial<RoleSessionJob>): RoleSessionJob {
    return {
      jobId: 'github:acme/app:2111',
      jobType: 'review',
      mergeRequestNumber: 2111,
      localPath: '/home/ai/projects/acme-app',
      worktreePath: '/home/ai/.reviewflow/worktrees/github-acme-app-2111',
      roleSessions: [],
      roleSessionsClosed: false,
      ...overrides,
    };
  }
}
