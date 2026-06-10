import { describe, it, expect } from 'vitest';

import { gitLabNoteEventGuard } from '@/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.js';

function validPayload(): unknown {
  return {
    object_kind: 'note',
    event_type: 'note',
    user: { username: 'alice', name: 'Alice' },
    project: {
      id: 1,
      name: 'test-project',
      path_with_namespace: 'test-org/test-project',
      web_url: 'https://gitlab.com/test-org/test-project',
      git_http_url: 'https://gitlab.com/test-org/test-project.git',
    },
    object_attributes: {
      id: 999,
      note: '/bypass-quality "hotfix"',
      noteable_type: 'MergeRequest',
      noteable_id: 42,
    },
    merge_request: {
      iid: 42,
      title: 'Test MR',
      state: 'opened',
      source_branch: 'feature/test',
      target_branch: 'main',
      url: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
    },
  };
}

describe('gitLabNoteEventGuard', () => {
  it('accepts a valid MR note payload', () => {
    const result = gitLabNoteEventGuard.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it('rejects a payload with the wrong object_kind', () => {
    const payload = {
      ...(validPayload() as Record<string, unknown>),
      object_kind: 'merge_request',
    };
    const result = gitLabNoteEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a payload where noteable_type is not MergeRequest', () => {
    const payload = validPayload() as { object_attributes: { noteable_type: string } };
    payload.object_attributes.noteable_type = 'Issue';
    const result = gitLabNoteEventGuard.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
