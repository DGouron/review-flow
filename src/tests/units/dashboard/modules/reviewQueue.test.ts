import { describe, expect, it } from 'vitest';

import {
  DORMANT_AFTER_DAYS,
  buildReviewQueueModel,
  lastActivityOf,
  parseConventionalTitle,
  projectSlugOf,
} from '@/dashboard/modules/reviewQueue.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function trackedMr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github-org/app-1',
    mrNumber: 1,
    title: 'feat(queue): sort by actor',
    url: 'https://github.com/org/app/pull/1',
    project: 'org/app',
    platform: 'github',
    assignment: { username: 'requester', assignedAt: daysAgo(3) },
    author: { username: 'carol', displayName: null },
    openThreads: 0,
    totalThreads: 2,
    totalWarnings: 0,
    totalBlocking: 0,
    totalFollowups: 1,
    createdAt: daysAgo(3),
    lastReviewAt: daysAgo(2),
    lastPushAt: null,
    approvedAt: null,
    reviews: [{ type: 'review', verdict: 'ready', grade: 'A', blocking: 0, warnings: 0 }],
    ...overrides,
  };
}

function activeJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'github:org/app:9',
    mrNumber: 9,
    project: 'org/app',
    mrUrl: 'https://github.com/org/app/pull/9',
    status: 'running',
    jobType: 'review',
    title: 'fix: keep the drawer closed',
    startedAt: daysAgo(0),
    ...overrides,
  };
}

function build(input: Record<string, unknown> = {}) {
  return buildReviewQueueModel({
    pendingFix: [],
    pendingApproval: [],
    activeJobs: [],
    projectAliases: ['org/app'],
    nowMs: NOW,
    activeLane: 'approve',
    authorFilter: null,
    ...input,
  });
}

describe('lastActivityOf', () => {
  it('reads the most recent of push, review, approval and creation instead of the creation date', () => {
    const activity = lastActivityOf(
      trackedMr({ createdAt: daysAgo(40), lastReviewAt: daysAgo(10), lastPushAt: daysAgo(4) }),
    );

    expect(activity).toBe(daysAgo(4));
  });

  it('returns null when the merge request carries no date', () => {
    expect(lastActivityOf({})).toBeNull();
  });
});

describe('projectSlugOf', () => {
  it('reads the namespace and project from https and ssh remotes of any host', () => {
    expect(projectSlugOf('https://github.com/org/app.git')).toBe('org/app');
    expect(projectSlugOf('git@gitlab.com:group/sub/app.git')).toBe('group/sub/app');
    expect(projectSlugOf('https://gitlab.example.org/group/app')).toBe('group/app');
  });

  it('returns null without a remote', () => {
    expect(projectSlugOf(undefined)).toBeNull();
    expect(projectSlugOf('')).toBeNull();
  });
});

describe('parseConventionalTitle', () => {
  it('splits scope, breaking mark and subject of a conventional title', () => {
    expect(parseConventionalTitle('refactor(learning-path)!: serve learner reads')).toEqual({
      scope: 'learning-path',
      breaking: true,
      subject: 'Serve learner reads',
    });
  });

  it('keeps a free-form title untouched', () => {
    expect(parseConventionalTitle('Add the sales tool')).toEqual({
      scope: null,
      breaking: false,
      subject: 'Add the sales tool',
    });
  });
});

describe('buildReviewQueueModel', () => {
  it('puts each merge request in the lane of the actor who must act', () => {
    const model = build({
      pendingApproval: [trackedMr({ id: 'a', mrNumber: 1 })],
      pendingFix: [trackedMr({ id: 'f', mrNumber: 2, openThreads: 1 })],
      activeJobs: [activeJob()],
    });

    expect(model.lanes).toEqual([
      { key: 'approve', count: 1 },
      { key: 'fix', count: 1 },
      { key: 'review', count: 1 },
      { key: 'dormant', count: 0 },
    ]);
  });

  it(`moves a merge request idle for more than ${DORMANT_AFTER_DAYS} days to the dormant lane`, () => {
    const model = build({
      activeLane: 'dormant',
      pendingApproval: [
        trackedMr({ id: 'old', mrNumber: 5, createdAt: daysAgo(90), lastReviewAt: daysAgo(31) }),
        trackedMr({ id: 'fresh', mrNumber: 6, lastReviewAt: daysAgo(29) }),
      ],
    });

    expect(model.rows.map((row) => row.mrNumber)).toEqual([5]);
    expect(model.rows[0]?.reason.key).toBe('queue.reason.dormantReady');
    expect(model.dormantIds).toEqual(['old']);
  });

  it('shows a merge request under review in the review lane even when it waits for a fix', () => {
    const model = build({
      activeLane: 'review',
      pendingFix: [trackedMr({ id: 'f', mrNumber: 9, openThreads: 3 })],
      activeJobs: [activeJob({ jobType: 'followup' })],
    });

    expect(model.lanes.find((lane) => lane.key === 'fix')?.count).toBe(0);
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.jobId).toBe('github:org/app:9');
    expect(model.rows[0]?.reason.key).toBe('queue.reason.followupRunning');
  });

  it('ignores jobs that belong to another project', () => {
    const model = build({
      activeLane: 'review',
      activeJobs: [activeJob({ project: 'org/other' })],
    });

    expect(model.rows).toEqual([]);
  });

  it('shows the pull request author, never the person who triggered the review', () => {
    const model = build({ pendingApproval: [trackedMr()] });

    expect(model.rows[0]?.author).toEqual({ username: 'carol', label: 'carol', initials: 'CA' });
  });

  it('shows no author when the platform did not send one', () => {
    const model = build({ pendingApproval: [trackedMr({ author: null })] });

    expect(model.rows[0]?.author).toBeNull();
  });

  it('measures the age of a row from its last activity', () => {
    const model = build({
      pendingApproval: [trackedMr({ createdAt: daysAgo(20), lastPushAt: daysAgo(1) })],
    });

    expect(model.rows[0]?.idleDays).toBe(1);
  });

  it('lists the oldest activity first in the approval lane', () => {
    const model = build({
      pendingApproval: [
        trackedMr({ id: 'recent', mrNumber: 1, lastReviewAt: daysAgo(1) }),
        trackedMr({ id: 'older', mrNumber: 2, lastReviewAt: daysAgo(8) }),
      ],
    });

    expect(model.rows.map((row) => row.id)).toEqual(['older', 'recent']);
  });

  it('filters rows and counts by author, and lists every author with their count', () => {
    const model = build({
      authorFilter: 'dave',
      pendingApproval: [
        trackedMr({ id: 'c1', author: { username: 'carol', displayName: null } }),
        trackedMr({ id: 'd1', author: { username: 'dave', displayName: 'Dave' } }),
      ],
    });

    expect(model.rows.map((row) => row.id)).toEqual(['d1']);
    expect(model.lanes[0]).toEqual({ key: 'approve', count: 1 });
    expect(model.authors).toEqual([
      { username: 'carol', label: 'carol', initials: 'CA', count: 1 },
      { username: 'dave', label: 'Dave', initials: 'DA', count: 1 },
    ]);
  });

  it('flags open threads in the fix lane and warnings left before approval', () => {
    const fix = build({
      activeLane: 'fix',
      pendingFix: [trackedMr({ openThreads: 2, totalThreads: 3 })],
    });
    const approve = build({ pendingApproval: [trackedMr({ totalWarnings: 1 })] });

    expect(fix.rows[0]?.reason).toEqual({
      key: 'queue.reason.openThreads',
      params: { count: 2 },
      tone: 'warn',
    });
    expect(fix.rows[0]?.threads).toEqual({ open: 2, total: 3, tone: 'warn' });
    expect(approve.rows[0]?.reason.key).toBe('queue.reason.warningsLeft');
  });

  it('carries the latest verdict and grade, never a score', () => {
    const model = build({ pendingApproval: [trackedMr()] });

    expect(model.rows[0]?.outcome).toEqual({ verdict: 'ready', grade: 'A' });
  });

  it('keeps every row, whatever the lane, so the selected one stays reachable', () => {
    const model = build({
      activeLane: 'fix',
      pendingApproval: [trackedMr({ id: 'a' })],
      pendingFix: [trackedMr({ id: 'f', mrNumber: 2 })],
    });

    expect(model.rows.map((row) => row.id)).toEqual(['f']);
    expect(model.allRows.map((row) => row.id).sort()).toEqual(['a', 'f']);
  });

  it('falls back to the approval lane when the requested lane is unknown', () => {
    expect(build({ activeLane: 'nope' }).activeLane).toBe('approve');
  });
});
