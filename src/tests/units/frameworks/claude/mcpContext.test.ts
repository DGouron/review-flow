import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeMcpContext, cleanupMcpContext } from '../../../../frameworks/claude/claudeInvoker.js';
import { ReviewJobFactory } from '../../../factories/reviewJob.factory.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:fs');
vi.mock('node:os');

describe('MCP Context file management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('writeMcpContext', () => {
    it('should write per-job context file with correct content', () => {
      const job = ReviewJobFactory.create({ id: 'job-123' });

      writeMcpContext(job);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs',
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/job-123.json',
        expect.stringContaining('"jobId": "job-123"'),
      );
    });

    it('should sanitize job ID with special characters in file path', () => {
      const job = ReviewJobFactory.create({ id: 'gitlab:org/repo:mr-5' });

      writeMcpContext(job);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/gitlab-org-repo-mr-5.json',
        expect.any(String),
      );
    });

    it('should include mergeRequestId, jobType, and localPath in context', () => {
      const job = ReviewJobFactory.create({
        id: 'job-456',
        platform: 'gitlab',
        projectPath: 'my-org/my-repo',
        mrNumber: 10,
        localPath: '/tmp/repos/my-repo',
        jobType: 'followup',
      });

      writeMcpContext(job);

      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.jobId).toBe('job-456');
      expect(parsed.localPath).toBe('/tmp/repos/my-repo');
      expect(parsed.mergeRequestId).toBe('gitlab-my-org/my-repo-10');
      expect(parsed.jobType).toBe('followup');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should write two separate files for concurrent jobs', () => {
      const jobA = ReviewJobFactory.create({ id: 'job-a' });
      const jobB = ReviewJobFactory.createFollowup({ id: 'job-b' });

      writeMcpContext(jobA);
      writeMcpContext(jobB);

      const calls = vi.mocked(fs.writeFileSync).mock.calls;
      const paths = calls.map(([path]) => path);
      expect(paths).toContain('/home/testuser/.claude-review/jobs/job-a.json');
      expect(paths).toContain('/home/testuser/.claude-review/jobs/job-b.json');
    });

    it('should not throw on write failure', () => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('disk full');
      });
      const job = ReviewJobFactory.create();

      expect(() => writeMcpContext(job)).not.toThrow();
    });
  });

  describe('cleanupMcpContext', () => {
    it('should delete the per-job file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupMcpContext('job-123');

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/job-123.json',
      );
    });

    it('should not attempt deletion if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      cleanupMcpContext('job-123');

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should only remove the specified job file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanupMcpContext('job-a');

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/job-a.json',
      );
    });

    it('should not throw on cleanup failure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('permission denied');
      });

      expect(() => cleanupMcpContext('job-123')).not.toThrow();
    });
  });
});
