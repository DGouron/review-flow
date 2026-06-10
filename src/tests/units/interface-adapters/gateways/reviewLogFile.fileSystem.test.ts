import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FileSystemReviewLogFileGateway } from '@/modules/data-lifecycle/interface-adapters/gateways/fileSystem/reviewLogFile.fileSystem.gateway.js';

describe('FileSystemReviewLogFileGateway', () => {
  let tempDirectory: string;
  let gateway: FileSystemReviewLogFileGateway;

  beforeEach(async () => {
    tempDirectory = join(tmpdir(), `reviewflow-test-${Date.now()}`);
    const logsDirectory = join(tempDirectory, '.claude', 'reviews', 'logs');
    await mkdir(logsDirectory, { recursive: true });
    gateway = new FileSystemReviewLogFileGateway();
  });

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  describe('getLogsDirectory', () => {
    it('should return the logs directory path', () => {
      const result = gateway.getLogsDirectory('/my/project');

      expect(result).toBe('/my/project/.claude/reviews/logs');
    });
  });

  describe('listLogFiles', () => {
    it('should return empty array when no log files exist', async () => {
      const result = await gateway.listLogFiles(tempDirectory);

      expect(result).toEqual([]);
    });

    it('should list stdout log files', async () => {
      const logsDirectory = gateway.getLogsDirectory(tempDirectory);
      await writeFile(join(logsDirectory, 'review-stdout.log'), 'log content');

      const result = await gateway.listLogFiles(tempDirectory);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('review-stdout.log');
      expect(result[0].size).toBeGreaterThan(0);
      expect(result[0].mtime).toBeTruthy();
    });

    it('should list json log files', async () => {
      const logsDirectory = gateway.getLogsDirectory(tempDirectory);
      await writeFile(join(logsDirectory, 'context.json'), '{}');

      const result = await gateway.listLogFiles(tempDirectory);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('context.json');
    });

    it('should return empty array when logs directory does not exist', async () => {
      const result = await gateway.listLogFiles('/nonexistent/path');

      expect(result).toEqual([]);
    });
  });

  describe('deleteLogFile', () => {
    it('should delete a log file and return true', async () => {
      const logsDirectory = gateway.getLogsDirectory(tempDirectory);
      await writeFile(join(logsDirectory, 'review-stdout.log'), 'log content');

      const result = await gateway.deleteLogFile(tempDirectory, 'review-stdout.log');

      expect(result).toBe(true);
      const remaining = await gateway.listLogFiles(tempDirectory);
      expect(remaining).toHaveLength(0);
    });

    it('should return false when file does not exist', async () => {
      const result = await gateway.deleteLogFile(tempDirectory, 'nonexistent.log');

      expect(result).toBe(false);
    });
  });
});
