import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:fs');
vi.mock('node:os');

vi.mock('../../../mcp/mcpLogger.js', () => ({
  mcpLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    getLogPath: vi.fn().mockReturnValue('/tmp/test.log'),
  },
}));

vi.mock('../../../config/projectConfig.js', () => ({
  getProjectAgents: () => [{ name: 'agent-a' }, { name: 'agent-b' }],
  getFollowupAgents: () => [{ name: 'followup-check' }],
}));

import {
  loadJobContextFromFile,
  getJobContextFromEnv,
  ensureJobContextLoaded,
} from '../../../mcp/mcpServerStdio.js';

describe('mcpServerStdio context loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  describe('loadJobContextFromFile', () => {
    it('should read the per-job file and return context', () => {
      const contextData = {
        jobId: 'job-123',
        localPath: '/tmp/repos/project',
        mergeRequestId: 'gitlab-org/repo-42',
        jobType: 'review',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(contextData));

      const result = loadJobContextFromFile('job-123');

      expect(result).toEqual(contextData);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/job-123.json',
        'utf-8',
      );
    });

    it('should sanitize job ID when building file path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        jobId: 'gitlab:org/repo:mr-5',
        localPath: '/tmp',
        mergeRequestId: 'mr-5',
        jobType: 'review',
      }));

      loadJobContextFromFile('gitlab:org/repo:mr-5');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/home/testuser/.claude-review/jobs/gitlab-org-repo-mr-5.json',
        'utf-8',
      );
    });

    it('should return null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadJobContextFromFile('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when file contains invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const result = loadJobContextFromFile('bad-json');

      expect(result).toBeNull();
    });

    it('should default jobType to review when not specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        jobId: 'job-1',
        localPath: '/tmp',
        mergeRequestId: 'mr-1',
      }));

      const result = loadJobContextFromFile('job-1');

      expect(result?.jobType).toBe('review');
    });
  });

  describe('getJobContextFromEnv', () => {
    it('should return context from env vars when all present', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        MCP_JOB_ID: 'env-job',
        MCP_LOCAL_PATH: '/tmp/env-project',
        MCP_MERGE_REQUEST_ID: 'mr-env-1',
        MCP_JOB_TYPE: 'followup',
      };

      const result = getJobContextFromEnv();

      expect(result).toEqual({
        jobId: 'env-job',
        localPath: '/tmp/env-project',
        mergeRequestId: 'mr-env-1',
        jobType: 'followup',
      });

      process.env = originalEnv;
    });

    it('should return null when env vars are missing', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env.MCP_JOB_ID = undefined;
      process.env.MCP_LOCAL_PATH = undefined;
      process.env.MCP_MERGE_REQUEST_ID = undefined;

      const result = getJobContextFromEnv();

      expect(result).toBeNull();

      process.env = originalEnv;
    });
  });

  describe('ensureJobContextLoaded', () => {
    it('should load context from file and register it', () => {
      const contextData = {
        jobId: 'job-lazy',
        localPath: '/tmp/repos/lazy',
        mergeRequestId: 'gitlab-org/lazy-10',
        jobType: 'review',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(contextData));

      const mockDeps = {
        jobContextGateway: {
          get: vi.fn().mockReturnValue(null),
          register: vi.fn(),
        },
        progressGateway: {
          createProgress: vi.fn(),
        },
      };

      ensureJobContextLoaded('job-lazy', mockDeps as never);

      expect(mockDeps.jobContextGateway.register).toHaveBeenCalledWith('job-lazy', {
        localPath: '/tmp/repos/lazy',
        mergeRequestId: 'gitlab-org/lazy-10',
      });
      expect(mockDeps.progressGateway.createProgress).toHaveBeenCalledWith(
        'job-lazy',
        ['agent-a', 'agent-b'],
      );
    });

    it('should skip loading if context is already registered', () => {
      const mockDeps = {
        jobContextGateway: {
          get: vi.fn().mockReturnValue({ localPath: '/existing', mergeRequestId: 'mr-1' }),
          register: vi.fn(),
        },
        progressGateway: {
          createProgress: vi.fn(),
        },
      };

      ensureJobContextLoaded('already-loaded', mockDeps as never);

      expect(mockDeps.jobContextGateway.register).not.toHaveBeenCalled();
      expect(mockDeps.progressGateway.createProgress).not.toHaveBeenCalled();
    });

    it('should use followup agents when jobType is followup', () => {
      const contextData = {
        jobId: 'followup-job',
        localPath: '/tmp/repos/followup',
        mergeRequestId: 'mr-followup',
        jobType: 'followup',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(contextData));

      const mockDeps = {
        jobContextGateway: {
          get: vi.fn().mockReturnValue(null),
          register: vi.fn(),
        },
        progressGateway: {
          createProgress: vi.fn(),
        },
      };

      ensureJobContextLoaded('followup-job', mockDeps as never);

      expect(mockDeps.progressGateway.createProgress).toHaveBeenCalledWith(
        'followup-job',
        ['followup-check'],
      );
    });

    it('should not throw when context file is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockDeps = {
        jobContextGateway: {
          get: vi.fn().mockReturnValue(null),
          register: vi.fn(),
        },
        progressGateway: {
          createProgress: vi.fn(),
        },
      };

      expect(() => ensureJobContextLoaded('missing', mockDeps as never)).not.toThrow();
      expect(mockDeps.jobContextGateway.register).not.toHaveBeenCalled();
    });
  });
});
