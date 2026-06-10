import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JobHistoryFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.js';
import { JobRecordFactory } from '@/tests/factories/jobRecord.factory.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

describe('JobHistoryFileSystemGateway', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-jobhistory-fs-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  describe('appendRecord', () => {
    it('creates the directory on first write and writes one JSONL line', async () => {
      const nestedRoot = join(rootDir, 'nested', 'jobs');
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir: nestedRoot, logger });
      const record = JobRecordFactory.create();

      await gateway.appendRecord(record);

      expect(existsSync(nestedRoot)).toBe(true);
      const filePath = join(nestedRoot, '2026-05-25.jsonl');
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content.trim()).toBe(JSON.stringify(record));
    });

    it('appends a second line when called twice on the same day', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });

      await gateway.appendRecord(JobRecordFactory.create({ jobId: 'first' }));
      await gateway.appendRecord(JobRecordFactory.create({ jobId: 'second' }));

      const filePath = join(rootDir, '2026-05-25.jsonl');
      const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).jobId).toBe('first');
      expect(JSON.parse(lines[1]).jobId).toBe('second');
    });

    it('writes records to the file derived from completedAt slice', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });

      await gateway.appendRecord(
        JobRecordFactory.create({ completedAt: '2026-06-01T08:00:00.000Z' }),
      );

      expect(existsSync(join(rootDir, '2026-06-01.jsonl'))).toBe(true);
    });
  });

  describe('loadRecordsWithinWindow', () => {
    it('returns an empty array when the directory does not exist', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({
        rootDir: join(rootDir, 'missing'),
        logger,
      });

      const result = await gateway.loadRecordsWithinWindow(7, new Date('2026-05-25T12:00:00.000Z'));

      expect(result).toEqual([]);
    });

    it('returns records inside the retention window only', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      await gateway.appendRecord(
        JobRecordFactory.create({
          jobId: 'old',
          completedAt: '2026-05-10T10:00:00.000Z',
        }),
      );
      await gateway.appendRecord(
        JobRecordFactory.create({
          jobId: 'recent',
          completedAt: '2026-05-24T10:00:00.000Z',
        }),
      );

      const result = await gateway.loadRecordsWithinWindow(7, new Date('2026-05-25T12:00:00.000Z'));

      expect(result).toHaveLength(1);
      expect(result[0]?.jobId).toBe('recent');
    });

    it('skips malformed JSONL lines and logs a warning per line', async () => {
      const { logger, warnMessages } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      const valid = JobRecordFactory.create({ jobId: 'valid' });
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(
        join(rootDir, '2026-05-25.jsonl'),
        `${JSON.stringify(valid)}\nnot-json-line\n${JSON.stringify({ ...valid, jobId: 'second' })}\n`,
      );

      const result = await gateway.loadRecordsWithinWindow(7, new Date('2026-05-25T12:00:00.000Z'));

      expect(result.map((entry) => entry.jobId).toSorted()).toEqual(['second', 'valid']);
      expect(warnMessages.some((message) => message.includes('Ligne 2 illisible, ignorée'))).toBe(
        true,
      );
    });

    it('skips lines whose JSON does not match the schema', async () => {
      const { logger, warnMessages } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(
        join(rootDir, '2026-05-25.jsonl'),
        `${JSON.stringify({ unrelated: 'object' })}\n`,
      );

      const result = await gateway.loadRecordsWithinWindow(7, new Date('2026-05-25T12:00:00.000Z'));

      expect(result).toEqual([]);
      expect(warnMessages.some((message) => message.includes('Ligne 1 illisible, ignorée'))).toBe(
        true,
      );
    });

    it('tolerates empty lines silently', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      const record = JobRecordFactory.create();
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(join(rootDir, '2026-05-25.jsonl'), `${JSON.stringify(record)}\n\n`);

      const result = await gateway.loadRecordsWithinWindow(7, new Date('2026-05-25T12:00:00.000Z'));

      expect(result).toHaveLength(1);
    });
  });

  describe('deleteRecordsOutsideWindow', () => {
    it('returns empty deletedFilenames when the directory does not exist', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({
        rootDir: join(rootDir, 'missing'),
        logger,
      });

      const result = await gateway.deleteRecordsOutsideWindow(
        7,
        new Date('2026-05-25T12:00:00.000Z'),
      );

      expect(result.deletedFilenames).toEqual([]);
    });

    it('deletes only files outside the retention window', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(join(rootDir, '2026-05-10.jsonl'), '');
      writeFileSync(join(rootDir, '2026-05-15.jsonl'), '');
      writeFileSync(join(rootDir, '2026-05-24.jsonl'), '');

      const result = await gateway.deleteRecordsOutsideWindow(
        7,
        new Date('2026-05-25T12:00:00.000Z'),
      );

      expect(result.deletedFilenames.toSorted()).toEqual(['2026-05-10.jsonl', '2026-05-15.jsonl']);
      expect(readdirSync(rootDir).toSorted()).toEqual(['2026-05-24.jsonl']);
    });

    it('ignores files whose filename is not a valid date pattern', async () => {
      const { logger } = createCapturingLogger();
      const gateway = new JobHistoryFileSystemGateway({ rootDir, logger });
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(join(rootDir, 'note.txt'), 'irrelevant');
      writeFileSync(join(rootDir, '2026-05-10.jsonl'), '');

      const result = await gateway.deleteRecordsOutsideWindow(
        7,
        new Date('2026-05-25T12:00:00.000Z'),
      );

      expect(result.deletedFilenames).toEqual(['2026-05-10.jsonl']);
      expect(existsSync(join(rootDir, 'note.txt'))).toBe(true);
    });
  });
});
