import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { roleSessionRecordSchema } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type {
  RoleSessionJobGateway,
  RoleSessionJobLookup,
  RoleSessionRecordResult,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionJob.gateway.js';
import { withExclusiveFileLock } from '@/modules/claude-invocation/interface-adapters/gateways/exclusiveFileLock.js';
import { sanitizeJobId } from '@/shared/services/mcpJobContext.js';

const DEFAULT_LOCK_WAIT_LIMIT_MS = 60_000;

const jobFileSchema = z.object({
  jobId: z.string().min(1),
  localPath: z.string().min(1),
  jobType: z.enum(['review', 'followup']).default('review'),
  mrNumber: z.number().int().positive(),
  worktreePath: z.string().min(1),
  roleSessions: z.array(roleSessionRecordSchema).default([]),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RoleSessionJobFileSystemGateway implements RoleSessionJobGateway {
  private readonly lockWaitLimitMs: number;

  constructor(
    private readonly jobsDirectory: string,
    options: { lockWaitLimitMs?: number } = {},
  ) {
    this.lockWaitLimitMs = options.lockWaitLimitMs ?? DEFAULT_LOCK_WAIT_LIMIT_MS;
  }

  find(jobId: string): RoleSessionJobLookup {
    const raw = this.readRaw(jobId);
    if (raw.status !== 'read') return raw;
    if (typeof raw.content.worktreePath !== 'string') {
      return { status: 'unusable', reason: `job ${jobId} has no worktree yet` };
    }
    const parsed = jobFileSchema.safeParse(raw.content);
    if (!parsed.success) {
      return {
        status: 'unusable',
        reason: `job ${jobId} file is invalid: ${parsed.error.message}`,
      };
    }
    const { mrNumber, ...job } = parsed.data;
    return { status: 'found', job: { ...job, mergeRequestNumber: mrNumber } };
  }

  recordRoleSession(jobId: string, record: RoleSessionRecord): RoleSessionRecordResult {
    const raw = this.readRaw(jobId);
    if (raw.status === 'not-found') return { recorded: false, reason: `unknown job ${jobId}` };
    if (raw.status === 'unusable') return { recorded: false, reason: raw.reason };
    const recorded: unknown[] = Array.isArray(raw.content.roleSessions)
      ? raw.content.roleSessions
      : [];
    const updated = { ...raw.content, roleSessions: [...recorded, record] };
    const path = this.jobFilePath(jobId);
    try {
      writeFileSync(`${path}.tmp`, JSON.stringify(updated, null, 2));
      renameSync(`${path}.tmp`, path);
      return { recorded: true };
    } catch (error) {
      return { recorded: false, reason: errorMessageOf(error) };
    }
  }

  async withExclusiveAccess<Result>(jobId: string, work: () => Promise<Result>): Promise<Result> {
    const lockPath = join(this.jobsDirectory, `${sanitizeJobId(jobId)}.lock`);
    return withExclusiveFileLock(lockPath, work, { waitLimitMs: this.lockWaitLimitMs });
  }

  private readRaw(
    jobId: string,
  ):
    | { status: 'read'; content: Record<string, unknown> }
    | { status: 'not-found' }
    | { status: 'unusable'; reason: string } {
    let text: string;
    try {
      text = readFileSync(this.jobFilePath(jobId), 'utf-8');
    } catch {
      return { status: 'not-found' };
    }
    try {
      return { status: 'read', content: jsonObjectSchema.parse(JSON.parse(text)) };
    } catch (error) {
      return {
        status: 'unusable',
        reason: `job ${jobId} file is unreadable: ${errorMessageOf(error)}`,
      };
    }
  }

  private jobFilePath(jobId: string): string {
    return join(this.jobsDirectory, `${sanitizeJobId(jobId)}.json`);
  }
}
