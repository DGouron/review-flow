import { describe, it, expect } from 'vitest';

import { InMemoryReviewLogFileGateway } from '@/tests/stubs/reviewLogFile.stub.js';

describe('ReviewLogFileGateway', () => {
  describe('listLogFiles', () => {
    it('should return empty array when no log files exist', async () => {
      const gateway = new InMemoryReviewLogFileGateway();

      const result = await gateway.listLogFiles('/my/project');

      expect(result).toEqual([]);
    });

    it('should list log files with metadata', async () => {
      const gateway = new InMemoryReviewLogFileGateway();
      gateway.addLogFile('/my/project', 'review-stdout.log', {
        mtime: '2026-03-01T00:00:00.000Z',
        size: 1024,
      });

      const result = await gateway.listLogFiles('/my/project');

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('review-stdout.log');
      expect(result[0].mtime).toBe('2026-03-01T00:00:00.000Z');
      expect(result[0].size).toBe(1024);
    });

    it('should only list log files for specified project', async () => {
      const gateway = new InMemoryReviewLogFileGateway();
      gateway.addLogFile('/project-a', 'a-stdout.log', {
        mtime: '2026-03-01T00:00:00.000Z',
        size: 512,
      });
      gateway.addLogFile('/project-b', 'b-stdout.log', {
        mtime: '2026-03-01T00:00:00.000Z',
        size: 256,
      });

      const result = await gateway.listLogFiles('/project-a');

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('a-stdout.log');
    });
  });

  describe('deleteLogFile', () => {
    it('should return false when log file does not exist', async () => {
      const gateway = new InMemoryReviewLogFileGateway();

      const result = await gateway.deleteLogFile('/my/project', 'nonexistent.log');

      expect(result).toBe(false);
    });

    it('should delete log file and return true', async () => {
      const gateway = new InMemoryReviewLogFileGateway();
      gateway.addLogFile('/my/project', 'review-stdout.log', {
        mtime: '2026-03-01T00:00:00.000Z',
        size: 1024,
      });

      const result = await gateway.deleteLogFile('/my/project', 'review-stdout.log');

      expect(result).toBe(true);
      const remaining = await gateway.listLogFiles('/my/project');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('getLogsDirectory', () => {
    it('should return the logs directory path', () => {
      const gateway = new InMemoryReviewLogFileGateway();

      const result = gateway.getLogsDirectory('/my/project');

      expect(result).toBe('/my/project/.claude/reviews/logs');
    });
  });
});
