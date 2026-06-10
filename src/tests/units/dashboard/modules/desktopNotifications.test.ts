import { describe, expect, it } from 'vitest';

import {
  getDesktopNotificationPayload,
  shouldNotifyDesktop,
} from '@/dashboard/modules/desktopNotifications.js';

describe('shouldNotifyDesktop', () => {
  it('should notify when permission is granted and document is hidden', () => {
    const result = shouldNotifyDesktop({
      permission: 'granted',
      isDocumentHidden: true,
    });

    expect(result).toBe(true);
  });

  it('should not notify when permission is not granted', () => {
    const result = shouldNotifyDesktop({
      permission: 'default',
      isDocumentHidden: true,
    });

    expect(result).toBe(false);
  });

  it('should notify when visible only if explicitly enabled', () => {
    const result = shouldNotifyDesktop({
      permission: 'granted',
      isDocumentHidden: false,
      notifyWhenVisible: true,
    });

    expect(result).toBe(true);
  });
});

describe('getDesktopNotificationPayload', () => {
  const translate = (key: string) => {
    const dictionary: Record<string, string> = {
      'notify.label.reviewStarted': 'Review',
      'notify.label.followupStarted': 'Follow-up',
      'notify.label.reviewCompleted': 'Review done',
      'notify.label.followupCompleted': 'Follow-up done',
      'notify.label.reviewFailed': 'Review failed',
      'notify.label.reviewPendingConfirmation': 'Awaiting confirmation',
    };
    return dictionary[key] ?? key;
  };

  it('builds a rich payload with emoji, author, project and title for reviewStarted', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 1234,
          title: 'feat(dashboard): add chart',
          project: 'main-app-v3/frontend',
          assignedBy: { displayName: 'Damien', username: 'dgouron' },
          id: 'gitlab-main-app-v3-1234',
          jobType: 'review',
        },
      },
      translate,
    );

    expect(result).toMatchObject({
      title: '🔍 Review · Damien · !1234',
      body: 'feat(dashboard): add chart\nfrontend',
      tag: 'reviewflow-reviewStarted-1234',
    });
  });

  it('uses # prefix and 🔁 emoji for github followupStarted', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'followupStarted',
        review: {
          mrNumber: 42,
          title: 'fix(auth): token refresh',
          project: 'org/repo',
          assignedBy: { displayName: 'Alice' },
          id: 'github-org-repo-42',
          jobType: 'followup',
        },
      },
      translate,
    );

    expect(result).toMatchObject({
      title: '🔁 Follow-up · Alice · #42',
      body: 'fix(auth): token refresh\nrepo',
      tag: 'reviewflow-followupStarted-42',
    });
  });

  it('falls back to username when displayName is missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 7,
          title: 'chore: bump deps',
          project: 'org/repo',
          assignedBy: { username: 'bob' },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title).toBe('🔍 Review · bob · !7');
  });

  it('omits author segment when assignedBy is missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 9,
          title: 'docs: update README',
          project: 'org/repo',
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title).toBe('🔍 Review · !9');
  });

  it('omits title line when title is missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 11,
          project: 'org/repo',
          assignedBy: { displayName: 'Alice' },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.body).toBe('repo');
  });

  it('uses ✅ for reviewCompleted', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewCompleted',
        review: {
          mrNumber: 5,
          title: 'feat: add login',
          project: 'org/repo',
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title.startsWith('✅ Review done')).toBe(true);
  });

  it('uses ❌ for reviewFailed', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewFailed',
        review: { mrNumber: 6, id: 'gitlab-x' },
      },
      translate,
    );

    expect(result?.title.startsWith('❌ Review failed')).toBe(true);
  });

  it('uses ⏳ for reviewPendingConfirmation', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewPendingConfirmation',
        review: { mrNumber: 8, id: 'gitlab-x' },
      },
      translate,
    );

    expect(result?.title.startsWith('⏳ Awaiting confirmation')).toBe(true);
  });

  it('uses author.displayName in title when present (priority over assignedBy)', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 100,
          title: 'feat: x',
          project: 'org/repo',
          assignedBy: { displayName: 'Reviewer' },
          author: { displayName: 'Author', username: 'author' },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title).toBe('🔍 Review · Author · !100');
  });

  it('falls back to author.username when displayName missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 101,
          title: 'feat: x',
          project: 'org/repo',
          author: { username: 'alice' },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title).toBe('🔍 Review · alice · !101');
  });

  it('falls back to assignedBy when author missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 102,
          project: 'org/repo',
          assignedBy: { displayName: 'Bob' },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.title).toBe('🔍 Review · Bob · !102');
  });

  it('renders 🪶 emoji and stats line for small size (additions+deletions < 50)', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 200,
          title: 'docs: update',
          project: 'org/repo',
          sizeMetrics: { additions: 20, deletions: 10, filesChanged: 2 },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.body).toBe('docs: update\n🪶 +20/-10 · 2 files · repo');
  });

  it('renders 🚀 emoji for medium size (50-300 lines)', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 201,
          title: 'feat: middle',
          project: 'org/repo',
          sizeMetrics: { additions: 120, deletions: 45, filesChanged: 8 },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.body).toBe('feat: middle\n🚀 +120/-45 · 8 files · repo');
  });

  it('renders 🐘 emoji for big size (>300 lines)', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 202,
          title: 'refactor: huge',
          project: 'org/repo',
          sizeMetrics: { additions: 700, deletions: 300, filesChanged: 25 },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.body).toBe('refactor: huge\n🐘 +700/-300 · 25 files · repo');
  });

  it('renders size emoji even when additions/deletions are null but filesChanged is known', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 203,
          title: 'fix: small',
          project: 'org/repo',
          sizeMetrics: { additions: null, deletions: null, filesChanged: 3 },
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.body).toBe('fix: small\n🪶 3 files · repo');
  });

  it('includes mrUrl in payload when present', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: {
          mrNumber: 300,
          mrUrl: 'https://gitlab.example.com/group/repo/-/merge_requests/300',
          id: 'gitlab-x',
        },
      },
      translate,
    );

    expect(result?.url).toBe('https://gitlab.example.com/group/repo/-/merge_requests/300');
  });

  it('omits url when mrUrl is missing', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: { mrNumber: 301, id: 'gitlab-x' },
      },
      translate,
    );

    expect(result?.url).toBeNull();
  });

  it('returns a GitLab-colored icon data URI for gitlab platform', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: { mrNumber: 400, id: 'gitlab-x' },
      },
      translate,
    );

    expect(result?.iconDataUri).toMatch(/^data:image\/svg\+xml/);
    expect(result?.iconDataUri).toContain('FC6D26');
  });

  it('returns a GitHub-colored icon data URI for github platform', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: { mrNumber: 401, id: 'github-org-repo-401' },
      },
      translate,
    );

    expect(result?.iconDataUri).toMatch(/^data:image\/svg\+xml/);
    expect(result?.iconDataUri).toContain('181717');
  });

  it('returns null for unknown notification kind', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'unknown',
        review: { mrNumber: 1 },
      },
      translate,
    );

    expect(result).toBeNull();
  });
});
