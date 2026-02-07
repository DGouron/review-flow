import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeJobId, getJobContextFilePath } from '../../../../shared/services/mcpJobContext.js';
import * as os from 'node:os';

vi.mock('node:os');

describe('mcpJobContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  describe('sanitizeJobId', () => {
    it('should replace colons with dashes', () => {
      expect(sanitizeJobId('job:123:abc')).toBe('job-123-abc');
    });

    it('should replace forward slashes with dashes', () => {
      expect(sanitizeJobId('job/123/abc')).toBe('job-123-abc');
    });

    it('should replace backslashes with dashes', () => {
      expect(sanitizeJobId('job\\123\\abc')).toBe('job-123-abc');
    });

    it('should handle mixed special characters', () => {
      expect(sanitizeJobId('gitlab:my/project\\mr-42')).toBe('gitlab-my-project-mr-42');
    });

    it('should leave valid characters unchanged', () => {
      expect(sanitizeJobId('simple-job-id-123')).toBe('simple-job-id-123');
    });
  });

  describe('getJobContextFilePath', () => {
    it('should return path under ~/.claude-review/jobs/', () => {
      const result = getJobContextFilePath('my-job-id');
      expect(result).toBe('/home/testuser/.claude-review/jobs/my-job-id.json');
    });

    it('should sanitize the jobId in the path', () => {
      const result = getJobContextFilePath('gitlab:project/path:mr-5');
      expect(result).toBe('/home/testuser/.claude-review/jobs/gitlab-project-path-mr-5.json');
    });
  });
});
