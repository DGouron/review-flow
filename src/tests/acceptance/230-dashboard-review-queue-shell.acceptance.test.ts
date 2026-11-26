/**
 * SPEC-230 — Dashboard shell: three views, a review queue by actor and a side panel.
 *
 * Outer-loop acceptance test. Source of truth: docs/specs/230-dashboard-review-queue-shell.md.
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { contextualQuestion } from '@/dashboard/modules/emberChat.js';
import {
  renderHeaderCapacityBadgeHtml,
  buildHeaderCapacityViewModel,
} from '@/dashboard/modules/headerCapacityBadge.js';
import { buildHealthModel } from '@/dashboard/modules/healthPill.js';
import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { buildPrDetailModel, renderPrDetailHtml } from '@/dashboard/modules/prDetailPanel.js';
import { buildReviewQueueModel } from '@/dashboard/modules/reviewQueue.js';
import { renderReviewQueueHtml } from '@/dashboard/modules/reviewQueueView.js';
import { renderGlobalSettingsHtml } from '@/dashboard/modules/settingsModal.js';
import { nudgeAuthorsRoutes } from '@/modules/tracking/interface-adapters/controllers/http/nudgeAuthors.routes.js';
import { NudgeAuthorsUseCase } from '@/modules/tracking/usecases/tracking/nudgeAuthors.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

function mergeRequest(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'github-acme/app-1',
    mrNumber: 1,
    title: 'feat(queue): sort by actor',
    url: 'https://github.com/acme/app/pull/1',
    project: 'acme/app',
    platform: 'github',
    assignment: { username: 'requester', assignedAt: daysAgo(1) },
    author: { username: 'carol', displayName: null },
    openThreads: 0,
    totalThreads: 1,
    totalWarnings: 0,
    createdAt: daysAgo(60),
    lastReviewAt: daysAgo(2),
    reviews: [{ type: 'review', verdict: 'ready', grade: 'A' }],
    ...overrides,
  };
}

function queue(input: Record<string, unknown>) {
  return buildReviewQueueModel({
    pendingFix: [],
    pendingApproval: [],
    activeJobs: [],
    projectAliases: ['acme/app'],
    nowMs: NOW,
    activeLane: 'approve',
    authorFilter: null,
    ...input,
  });
}

describe('SPEC-230 — dashboard review queue shell', () => {
  afterEach(() => setLanguage('en'));

  it('queue by actor: you approve, the author fixes, Claude reviews, idle ones rest apart', () => {
    const model = queue({
      pendingApproval: [
        mergeRequest({ id: 'ready' }),
        mergeRequest({ id: 'idle', mrNumber: 4, lastReviewAt: daysAgo(45) }),
      ],
      pendingFix: [mergeRequest({ id: 'fix', mrNumber: 2, openThreads: 2 })],
      activeJobs: [
        {
          id: 'github:acme/app:3',
          mrNumber: 3,
          project: 'acme/app',
          status: 'running',
          title: 'x',
        },
      ],
    });

    expect(model.lanes).toEqual([
      { key: 'approve', count: 1 },
      { key: 'fix', count: 1 },
      { key: 'review', count: 1 },
      { key: 'dormant', count: 1 },
    ]);
  });

  it('author filter narrows every lane to one author', () => {
    const model = queue({
      authorFilter: 'dave',
      pendingApproval: [
        mergeRequest({ id: 'c' }),
        mergeRequest({ id: 'd', author: { username: 'dave', displayName: null } }),
      ],
    });

    expect(model.rows.map((row) => row.id)).toEqual(['d']);
  });

  it('actions on the row: approve, run the follow-up, cancel, nudge', () => {
    const approve = renderReviewQueueHtml(queue({ pendingApproval: [mergeRequest({})] }), t);
    const fix = renderReviewQueueHtml(
      queue({ activeLane: 'fix', pendingFix: [mergeRequest({ openThreads: 1 })] }),
      t,
    );
    const dormant = renderReviewQueueHtml(
      queue({
        activeLane: 'dormant',
        pendingApproval: [mergeRequest({ lastReviewAt: daysAgo(40) })],
      }),
      t,
    );

    expect(approve).toContain('data-action="approve"');
    expect(fix).toContain('data-action="followup"');
    expect(dormant).toContain('data-action="nudge"');
    expect(dormant).toContain('data-action="nudge-all"');
  });

  it('shows the pull request author, not who requested the review, and the last activity, not the creation date', () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    const tracked = new TrackAssignmentUseCase(tracking).execute({
      projectPath: '/repo/app',
      mrInfo: {
        mrNumber: 7,
        title: 'fix: keep the drawer closed',
        url: 'https://github.com/acme/app/pull/7',
        project: 'acme/app',
        platform: 'github',
        sourceBranch: 'fix/drawer',
        targetBranch: 'master',
      },
      assignedBy: { username: 'requester' },
      author: { username: 'carol', displayName: null },
    });
    const model = queue({
      pendingApproval: [
        { ...tracked, createdAt: daysAgo(50), lastPushAt: daysAgo(3), reviews: [] },
      ],
    });

    expect(model.rows[0]?.author?.username).toBe('carol');
    expect(model.rows[0]?.idleDays).toBe(3);
  });

  it('grades A to E everywhere, never a score out of ten', () => {
    const tracked = mergeRequest({
      reviews: [{ type: 'review', verdict: 'changes', grade: 'C', score: 7 }],
    });
    const model = queue({ activeLane: 'fix', pendingFix: [tracked] });
    const row = model.rows[0];
    if (!row) throw new Error('row expected');

    const html =
      renderReviewQueueHtml(model, t) + renderPrDetailHtml(buildPrDetailModel(row, tracked), t);

    expect(html).toContain('>C</span>');
    expect(html).not.toMatch(/\d+(\.\d+)?\s*\/\s*10/);
  });

  it('one status pill summarises Claude CLI, the platform CLI, updates, worktrees and version', () => {
    const model = buildHealthModel({
      claude: { state: 'ok', detail: '2.1.332' },
      platform: { kind: 'github', state: 'ok', detail: '@octocat' },
      connection: 'websocket',
      worktrees: { active: 2, disk: '745 MB', failed: 0 },
      version: { current: '3.56.2', latest: null, updateAvailable: false },
    });

    expect(model.tone).toBe('ok');
    expect(model.lines).toHaveLength(5);
  });

  it('capacity reads "x/5 in parallel"', () => {
    setLanguage('fr');
    expect(
      renderHeaderCapacityBadgeHtml(buildHeaderCapacityViewModel({ running: 1, max: 5 })),
    ).toContain('<span class="mono">1/5</span><span class="pill-hint">en parallèle</span>');
  });

  it('model, trigger and timeout live in the settings', () => {
    const html = renderGlobalSettingsHtml({
      model: 'opus',
      triggerMode: 'full-auto',
      reviewTimeout: { minutes: 30, min: 5, max: 480 },
    });

    expect(html).toContain('id="model-select"');
    expect(html).toContain('id="trigger-mode-select"');
    expect(html).toContain('id="review-timeout-input"');
  });

  it('Ember keeps the selected pull request as context', () => {
    expect(
      contextualQuestion(
        'Risky parts?',
        { prefix: '#', mrNumber: 7, subject: 'Keep the drawer closed' },
        t,
      ),
    ).toContain('#7');
  });

  it('grouped nudge posts one reminder per dormant pull request, in the dashboard language', async () => {
    const tracking = new InMemoryReviewRequestTrackingGateway();
    tracking.create(
      '/repo/app',
      TrackedMrFactory.create({
        id: 'github-acme/app-9',
        mrNumber: 9,
        project: 'acme/app',
        platform: 'github',
        author: { username: 'carol', displayName: null },
      }),
    );
    tracking.create(
      '/repo/app',
      TrackedMrFactory.create({
        id: 'github-acme/app-10',
        mrNumber: 10,
        project: 'acme/app',
        platform: 'github',
        author: null,
      }),
    );
    const posts = new StubNoteCommentPostGateway();
    const app = Fastify();
    await app.register(nudgeAuthorsRoutes, {
      nudgeAuthors: new NudgeAuthorsUseCase(tracking, () => posts),
      logger: createStubLogger(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/nudge',
      payload: {
        projectPath: '/repo/app',
        mrIds: ['github-acme/app-9', 'github-acme/app-10'],
        language: 'fr',
      },
    });

    expect(response.json()).toEqual({ success: true, nudged: [9, 10], failed: [] });
    expect(posts.calls.map((call) => call.body.slice(0, 7))).toEqual(['@carol,', 'Cette P']);
  });
});
