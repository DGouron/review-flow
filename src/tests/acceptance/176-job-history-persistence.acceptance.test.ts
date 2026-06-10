/**
 * SPEC-176 — Persist Completed Job History to Disk
 *
 * Spec: docs/specs/176-job-history-persistence.md
 * Plan: docs/plans/176-job-history-persistence.plan.md
 *
 * Outer-loop acceptance test (SDD): mirrors the 10 scenarios defined in
 * the spec's `## Scenarios` block. Stays RED until step 13 (wiring) lands.
 * Tests exercise the use cases + JobHistoryFileSystemGateway against a tmpdir,
 * proving the persistence layer satisfies the spec end-to-end.
 */

import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { JobStatus } from '@/frameworks/queue/pQueueAdapter.js';
import type { JobHistoryGateway } from '@/modules/review-execution/entities/job/jobHistory.gateway.js';
import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';
import { JobHistoryFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.js';
import { LoadRecentJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.js';
import { PersistJobRecordUseCase } from '@/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.js';
import { PruneJobHistoryUseCase } from '@/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.js';
import { ReviewJobFactory } from '@/tests/factories/reviewJob.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

describe('Acceptance — SPEC-176: Job History Persistence', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-jobhistory-acc-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function makeCompletedStatus(overrides: Partial<JobStatus> = {}): JobStatus {
    return {
      job: ReviewJobFactory.create(),
      status: 'completed',
      startedAt: new Date('2026-05-25T10:00:00.000Z'),
      completedAt: new Date('2026-05-25T10:05:00.000Z'),
      ...overrides,
    };
  }

  it('Scenario 1 — nominal write on success: completed job appends one record with status success', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await persist.execute({
      jobStatus: makeCompletedStatus(),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    const filePath = join(rootDir, '2026-05-25.jsonl');
    expect(existsSync(filePath)).toBe(true);
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const record: unknown = JSON.parse(lines[0]);
    expect(record).toMatchObject({
      jobId: 'gitlab:test-org/test-project:42',
      status: 'success',
      exitReason: null,
    });
  });

  it('Scenario 2 — write on failure with exitReason: appends a record with status failed', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await persist.execute({
      jobStatus: makeCompletedStatus({
        status: 'failed',
        error: 'claude exit code 1',
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    const filePath = join(rootDir, '2026-05-25.jsonl');
    const record: unknown = JSON.parse(readFileSync(filePath, 'utf-8').trim());
    expect(record).toMatchObject({
      status: 'failed',
      exitReason: 'claude exit code 1',
    });
  });

  it('Scenario 3 — write on killed job: aborted signal yields status killed', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await persist.execute({
      jobStatus: makeCompletedStatus({
        status: 'failed',
        error: 'Annulé par utilisateur',
      }),
      abortSignalAborted: true,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    const filePath = join(rootDir, '2026-05-25.jsonl');
    const record: unknown = JSON.parse(readFileSync(filePath, 'utf-8').trim());
    expect(record).toMatchObject({
      status: 'killed',
      exitReason: 'Annulé par utilisateur',
    });
  });

  it('Scenario 4 — retention sweep on startup deletes files older than retentionDays', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const prune = new PruneJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    mkdirSync(rootDir, { recursive: true });
    writeFileSync(join(rootDir, '2026-05-10.jsonl'), '');
    writeFileSync(join(rootDir, '2026-05-15.jsonl'), '');
    writeFileSync(join(rootDir, '2026-05-25.jsonl'), '');

    const result = await prune.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result.deletedFilenames.toSorted()).toEqual(['2026-05-10.jsonl', '2026-05-15.jsonl']);
    const remaining = readdirSync(rootDir);
    expect(remaining).toEqual(['2026-05-25.jsonl']);
  });

  it('Scenario 5 — reload at startup repopulates the in-memory recent list', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });
    const load = new LoadRecentJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    await persist.execute({
      jobStatus: makeCompletedStatus({
        startedAt: new Date('2026-05-24T08:00:00.000Z'),
        completedAt: new Date('2026-05-24T08:30:00.000Z'),
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-24T08:30:01.000Z'),
    });
    await persist.execute({
      jobStatus: makeCompletedStatus({
        job: ReviewJobFactory.create({ id: 'gitlab:test-org/other:99', mrNumber: 99 }),
        startedAt: new Date('2026-05-25T10:00:00.000Z'),
        completedAt: new Date('2026-05-25T10:05:00.000Z'),
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    const records = await load.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(records).toHaveLength(2);
    const [first, second] = records;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first && second) {
      expect(first.completedAt > second.completedAt).toBe(true);
    }
  });

  it('Scenario 6 — write failure best-effort: a throwing gateway does not rethrow', async () => {
    const { logger, warnMessages } = createCapturingLogger();
    const throwingGateway: JobHistoryGateway = {
      appendRecord: async () => {
        throw new Error('disque plein');
      },
      loadRecordsWithinWindow: async () => [],
      deleteRecordsOutsideWindow: async () => ({ deletedFilenames: [] }),
    };
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: throwingGateway, logger });

    await expect(
      persist.execute({
        jobStatus: makeCompletedStatus(),
        abortSignalAborted: false,
        now: () => new Date('2026-05-25T10:05:01.000Z'),
      }),
    ).resolves.toBeUndefined();

    expect(warnMessages.some((message) => message.includes('Échec persistance job'))).toBe(true);
  });

  it('Scenario 7 — malformed line tolerated: a corrupted JSONL file yields valid records + warning', async () => {
    const { logger, warnMessages } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const load = new LoadRecentJobHistoryUseCase({ jobHistoryGateway: gateway, logger });

    const validRecord: JobRecord = {
      jobId: 'gitlab:project:42',
      platform: 'gitlab',
      projectPath: 'group/project',
      mergeRequestId: 42,
      jobType: 'review',
      startedAt: '2026-05-25T10:00:00.000Z',
      completedAt: '2026-05-25T10:05:00.000Z',
      durationMs: 300000,
      status: 'success',
      exitReason: null,
    };
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(
      join(rootDir, '2026-05-25.jsonl'),
      `${JSON.stringify(validRecord)}\n{ this is not json\n${JSON.stringify({ ...validRecord, jobId: 'second' })}\n`,
    );

    const records = await load.execute({
      retentionDays: 7,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(records).toHaveLength(2);
    expect(warnMessages.some((message) => message.includes('Ligne'))).toBe(true);
  });

  it('Scenario 8 — missing storage directory: auto-created on first write', async () => {
    const nestedRoot = join(rootDir, 'nested', 'jobs');
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir: nestedRoot, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    expect(existsSync(nestedRoot)).toBe(false);

    await persist.execute({
      jobStatus: makeCompletedStatus(),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T10:05:01.000Z'),
    });

    expect(existsSync(nestedRoot)).toBe(true);
    expect(existsSync(join(nestedRoot, '2026-05-25.jsonl'))).toBe(true);
  });

  it('Scenario 9 — concurrent writes: two simultaneous appends both land without corruption', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    const statusA = makeCompletedStatus({
      job: ReviewJobFactory.create({ id: 'gitlab:a:1', mrNumber: 1 }),
    });
    const statusB = makeCompletedStatus({
      job: ReviewJobFactory.create({ id: 'gitlab:b:2', mrNumber: 2 }),
    });

    await Promise.all([
      persist.execute({
        jobStatus: statusA,
        abortSignalAborted: false,
        now: () => new Date('2026-05-25T10:05:01.000Z'),
      }),
      persist.execute({
        jobStatus: statusB,
        abortSignalAborted: false,
        now: () => new Date('2026-05-25T10:05:01.000Z'),
      }),
    ]);

    const filePath = join(rootDir, '2026-05-25.jsonl');
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = lines.map((line) => JSON.parse(line) as { jobId: string });
    const ids = parsed.map((entry) => entry.jobId).toSorted();
    expect(ids).toEqual(['gitlab:a:1', 'gitlab:b:2']);
  });

  it('Scenario 10 — daily rotation: a record completed after midnight lands in the new day file', async () => {
    const { logger } = createCapturingLogger();
    const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
    const persist = new PersistJobRecordUseCase({ jobHistoryGateway: gateway, logger });

    await persist.execute({
      jobStatus: makeCompletedStatus({
        startedAt: new Date('2026-05-24T23:55:00.000Z'),
        completedAt: new Date('2026-05-24T23:59:00.000Z'),
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-24T23:59:01.000Z'),
    });
    await persist.execute({
      jobStatus: makeCompletedStatus({
        job: ReviewJobFactory.create({ id: 'gitlab:next:1', mrNumber: 1 }),
        startedAt: new Date('2026-05-25T00:00:30.000Z'),
        completedAt: new Date('2026-05-25T00:05:00.000Z'),
      }),
      abortSignalAborted: false,
      now: () => new Date('2026-05-25T00:05:01.000Z'),
    });

    expect(existsSync(join(rootDir, '2026-05-24.jsonl'))).toBe(true);
    expect(existsSync(join(rootDir, '2026-05-25.jsonl'))).toBe(true);
    const yesterday = readFileSync(join(rootDir, '2026-05-24.jsonl'), 'utf-8').trim().split('\n');
    const today = readFileSync(join(rootDir, '2026-05-25.jsonl'), 'utf-8').trim().split('\n');
    expect(yesterday).toHaveLength(1);
    expect(today).toHaveLength(1);
  });
});
