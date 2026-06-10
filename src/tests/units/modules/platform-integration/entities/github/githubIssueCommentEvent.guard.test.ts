import { describe, it, expect } from 'vitest';

import { gitHubIssueCommentEventGuard } from '@/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.js';

function validPayload(): unknown {
  return {
    action: 'created',
    issue: {
      number: 42,
      pull_request: { url: 'https://api.github.com/repos/test-owner/test-repo/pulls/42' },
    },
    comment: {
      body: '/bypass-quality "hotfix"',
      user: { login: 'alice' },
    },
    repository: {
      full_name: 'test-owner/test-repo',
      html_url: 'https://github.com/test-owner/test-repo',
      clone_url: 'https://github.com/test-owner/test-repo.git',
    },
    sender: { login: 'alice' },
  };
}

describe('gitHubIssueCommentEventGuard', () => {
  it('accepts a valid PR comment payload', () => {
    const result = gitHubIssueCommentEventGuard.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it('rejects a comment on an issue that has no pull_request sub-object', () => {
    const base = validPayload() as { issue: { number: number; pull_request?: unknown } };
    const payload = { ...base, issue: { number: base.issue.number } };
    const result = gitHubIssueCommentEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a payload with the wrong action', () => {
    const payload = { ...(validPayload() as Record<string, unknown>), action: 'deleted' };
    const result = gitHubIssueCommentEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
