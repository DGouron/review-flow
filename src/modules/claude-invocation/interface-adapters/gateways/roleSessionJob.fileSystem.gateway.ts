import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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
import { sanitizeJobId } from '@/shared/services/mcpJobContext.js';

const LOCK_RETRY_DELAY_MS = 50;
const LOCK_WAIT_LIMIT_MS = 60_000;
const STALE_LOCK_AGE_MS = 120_000;

const jobFileSchema = z.object({
  jobId: z.string().min(1),
  localPath: z.string().min(1),
  jobType: z.enum(['review', 'followup']).default('review'),
  mrNumber: z.number().int().positive(),
  worktreePath: z.string().min(1),
  roleSessions: z.array(roleSessionRecordSchema).default([]),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

const recordingJobFileSchema = z.object({
  jobId: z.string().min(1),
  roleSessions: z.array(z.unknown()).default([]),
});

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJsonOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class RoleSessionJobFileSystemGateway implements RoleSessionJobGateway {
  constructor(private readonly jobsDirectory: string) {}

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

  listRecordedRoleSessions(): RecordedRoleSession[] {
    return this.jobFileNames().flatMap((fileName) => {
      const parsed = recordingJobFileSchema.safeParse(
        readJsonOrNull(join(this.jobsDirectory, fileName)),
      );
      if (!parsed.success) return [];
      const { jobId, roleSessions } = parsed.data;
      return roleSessions.flatMap((candidate) => {
        const record = roleSessionRecordSchema.safeParse(candidate);
        return record.success ? [{ jobId, record: record.data }] : [];
      });
    });
  }

  async withExclusiveAccess<Result>(jobId: string, work: () => Promise<Result>): Promise<Result> {
    const lockPath = join(this.jobsDirectory, `${sanitizeJobId(jobId)}.lock`);
    await this.acquire(lockPath);
    try {
      return await work();
    } finally {
      rmSync(lockPath, { force: true });
    }
  }

  private async acquire(lockPath: string): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
    while (!this.tryCreateLock(lockPath)) {
      if (Date.now() > deadline) {
        throw new Error(`another launch holds ${lockPath}`);
      }
      await delay(LOCK_RETRY_DELAY_MS);
    }
  }

  private tryCreateLock(lockPath: string): boolean {
    try {
      closeSync(openSync(lockPath, 'wx'));
      return true;
    } catch {
      this.removeStaleLock(lockPath);
      return false;
    }
  }

  private removeStaleLock(lockPath: string): void {
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_AGE_MS) {
        rmSync(lockPath, { force: true });
      }
    } catch {
      return;
    }
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
