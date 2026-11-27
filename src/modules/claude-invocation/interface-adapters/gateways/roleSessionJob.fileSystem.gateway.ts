import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { roleSessionRecordSchema } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type { RoleSessionRecord } from '@/modules/claude-invocation/entities/roleSession/roleSession.schema.js';
import type {
  RecordedRoleSession,
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
  roleSessionsClosed: z.boolean().default(false),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

const recordingJobFileSchema = z.object({
  jobId: z.string().min(1),
  roleSessions: z.array(z.unknown()).default([]),
});

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordsIn(candidates: unknown): RoleSessionRecord[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    const record = roleSessionRecordSchema.safeParse(candidate);
    return record.success ? [record.data] : [];
  });
}

function readJsonOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
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
    try {
      this.write(jobId, { ...raw.content, roleSessions: [...recorded, record] });
      return { recorded: true };
    } catch (error) {
      return { recorded: false, reason: errorMessageOf(error) };
    }
  }

  closeRoleSessions(jobId: string): RoleSessionRecord[] {
    const raw = this.readRaw(jobId);
    if (raw.status !== 'read') return [];
    this.write(jobId, { ...raw.content, roleSessionsClosed: true });
    return recordsIn(raw.content.roleSessions);
  }

  private write(jobId: string, content: Record<string, unknown>): void {
    const path = this.jobFilePath(jobId);
    writeFileSync(`${path}.tmp`, JSON.stringify(content, null, 2));
    renameSync(`${path}.tmp`, path);
  }

  listRecordedRoleSessions(): RecordedRoleSession[] {
    return this.jobFileNames().flatMap((fileName) => {
      const parsed = recordingJobFileSchema.safeParse(
        readJsonOrNull(join(this.jobsDirectory, fileName)),
      );
      if (!parsed.success) return [];
      const { jobId, roleSessions } = parsed.data;
      return recordsIn(roleSessions).map((record) => ({ jobId, record }));
    });
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

  private jobFileNames(): string[] {
    try {
      return readdirSync(this.jobsDirectory).filter((fileName) => fileName.endsWith('.json'));
    } catch {
      return [];
    }
  }

  private jobFilePath(jobId: string): string {
    return join(this.jobsDirectory, `${sanitizeJobId(jobId)}.json`);
  }
}
