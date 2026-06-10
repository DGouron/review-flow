import { describe, it, expect } from 'vitest';

import { buildMcpSystemPrompt } from '@/frameworks/claude/claudeInvoker.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';

function buildJob(overrides: Partial<ReviewJob>): ReviewJob {
  return {
    id: 'job-1',
    platform: 'gitlab',
    projectPath: 'group/project',
    localPath: '/tmp/project',
    mrNumber: 42,
    skill: 'review-followup',
    mrUrl: 'https://example.com/mr/42',
    sourceBranch: 'feat/x',
    targetBranch: 'main',
    jobType: 'followup',
    ...overrides,
  };
}

describe('buildMcpSystemPrompt', () => {
  describe('SPEC-170 FR-7 — local state is no longer disclaimed', () => {
    it('does not contain the UNRELIABLE warning anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'gitlab', mrNumber: 7 }));

      expect(prompt).not.toContain('UNRELIABLE');
    });

    it('does not contain the FORBIDDEN keyword anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'gitlab', mrNumber: 7 }));

      expect(prompt).not.toContain('FORBIDDEN');
    });

    it('does not recommend glab mr diff anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'gitlab', mrNumber: 7 }));

      expect(prompt).not.toContain('glab mr diff');
    });

    it('does not recommend gh pr diff anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'github', mrNumber: 100 }));

      expect(prompt).not.toContain('gh pr diff');
    });

    it('does not recommend glab mr view anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'gitlab', mrNumber: 7 }));

      expect(prompt).not.toContain('glab mr view');
    });

    it('does not recommend gh pr view anymore', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ platform: 'github', mrNumber: 100 }));

      expect(prompt).not.toContain('gh pr view');
    });
  });

  describe('still keeps the MCP get_threads tool reference', () => {
    it('mentions get_threads MCP tool with the job id', () => {
      const prompt = buildMcpSystemPrompt(buildJob({ id: 'job-xyz' }));

      expect(prompt).toContain('get_threads');
      expect(prompt).toContain('job-xyz');
    });
  });
});
