/**
 * SPEC-219 — Surface oversized-MR blocks on the dashboard with a force-launch
 * option (outer-loop acceptance test, SDD).
 *
 * Exercises the feature at its public seams:
 *   - the review-mode block is persisted on the TrackedMr as a sizeBlock record
 *     (RecordSizeBlockUseCase over the in-memory tracking gateway);
 *   - GET /api/size-blocks aggregates every currently-blocked MR across enabled
 *     projects and shapes it through SizeBlockListPresenter;
 *   - POST /api/mr-tracking/force-start enqueues a real review job then clears
 *     the sizeBlock (ForceLaunchBlockedReviewUseCase);
 *   - force-launch dedup leaves the sizeBlock untouched when the enqueue is
 *     rejected as a duplicate;
 *   - a non-oversized MR writes no sizeBlock (behaviour identical to spec 209);
 *   - maxDiffLines round-trips through the project-config update use case.
 *
 * Scenarios from docs/specs/219-oversized-mr-force-launch-panel.md.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { applyDiffSizeGuard } from '@/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.js';
import { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import { createTrackedMrId } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { sizeBlocksRoutes } from '@/modules/tracking/interface-adapters/controllers/http/sizeBlocks.routes.js';
import { SizeBlockListPresenter } from '@/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.js';
import { ForceLaunchBlockedReviewUseCase } from '@/modules/tracking/usecases/tracking/forceLaunchBlockedReview.usecase.js';
import { RecordSizeBlockUseCase } from '@/modules/tracking/usecases/tracking/recordSizeBlock.usecase.js';
import { ChangedFilesFactory } from '@/tests/factories/changedFiles.factory.js';
import { MrTrackingDataFactory, TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubApprovalRevocationGateway } from '@/tests/stubs/approvalRevocation.stub.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const BUDGET = 2000;
const FIXED_NOW = '2026-07-15T12:00:00.000Z';

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    github: false,
    gitlab: true,
    defaultModel: 'sonnet',
    reviewSkill: 'review',
    reviewFollowupSkill: 'review-followup',
    language: 'fr',
    retentionDays: 14,
    ...overrides,
  };
}

function noopProcessor(): (job: ReviewJob, signal: AbortSignal) => Promise<void> {
  return async () => undefined;
}

describe('Acceptance — SPEC-219: oversized-MR blocks force-launch panel', () => {
  describe('Rule: an oversized review-mode block is persisted on the TrackedMr', () => {
    it('block persisted: records countedLines, budget, message and blockedAt', () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      const mrId = createTrackedMrId('gitlab', 'group/project', 42);
      tracking.saveTracking(
        '/repo/project',
        MrTrackingDataFactory.withMrs([TrackedMrFactory.create({ id: mrId, mrNumber: 42 })]),
      );
      const recordSizeBlock = new RecordSizeBlockUseCase(tracking);

      const result = recordSizeBlock.execute({
        projectPath: '/repo/project',
        mrId,
        countedLines: 2500,
        budget: 2000,
        message: 'Petite pause avant la revue',
        now: () => FIXED_NOW,
      });

      expect(result.kind).toBe('recorded');
      const persisted = tracking.getById('/repo/project', mrId);
      expect(persisted?.sizeBlock).toEqual({
        countedLines: 2500,
        budget: 2000,
        message: 'Petite pause avant la revue',
        blockedAt: FIXED_NOW,
      });
    });
  });

  describe('Rule: a non-oversized MR writes no sizeBlock (spec 209 behaviour kept)', () => {
    it('unrelated MR: guard is not blocked, nothing to persist', async () => {
      const changedFilesGateway = new StubChangedFilesFetchGateway();
      changedFilesGateway.setResponse(
        42,
        ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 50, deletions: 10 }]),
      );

      const guardResult = await applyDiffSizeGuard({
        projectIdentifier: 'group/project',
        localPath: '/repo/project',
        mergeRequestNumber: 42,
        mode: 'review',
        deps: {
          guardDiffSize: new GuardDiffSizeUseCase({
            changedFilesFetchGateway: changedFilesGateway,
          }),
          getMaxDiffLines: () => BUDGET,
          noteCommentPostGateway: new StubNoteCommentPostGateway(),
          approvalRevocationGateway: new StubApprovalRevocationGateway(),
        },
        logger: createStubLogger(),
      });

      expect(guardResult.blocked).toBe(false);
    });
  });

  describe('Rule: a dashboard endpoint aggregates every currently-blocked MR', () => {
    let app: FastifyInstance;
    let tracking: InMemoryReviewRequestTrackingGateway;

    beforeEach(async () => {
      tracking = new InMemoryReviewRequestTrackingGateway();
      tracking.saveTracking(
        '/repo/a',
        MrTrackingDataFactory.withMrs([
          TrackedMrFactory.create({
            id: createTrackedMrId('gitlab', 'group/a', 1),
            mrNumber: 1,
            title: 'MR A',
            project: 'group/a',
            sizeBlock: {
              countedLines: 2500,
              budget: 2000,
              message: 'trop gros',
              blockedAt: FIXED_NOW,
            },
          }),
        ]),
      );
      tracking.saveTracking(
        '/repo/b',
        MrTrackingDataFactory.withMrs([
          TrackedMrFactory.create({
            id: createTrackedMrId('github', 'owner/b', 2),
            mrNumber: 2,
            title: 'PR B',
            project: 'owner/b',
            platform: 'github',
            sizeBlock: {
              countedLines: 4000,
              budget: 1500,
              message: 'trop gros',
              blockedAt: FIXED_NOW,
            },
          }),
        ]),
      );

      app = Fastify();
      await app.register(sizeBlocksRoutes, {
        getRepositories: () => [
          {
            name: 'Project A',
            platform: 'gitlab',
            remoteUrl: 'https://gitlab.com/group/a.git',
            localPath: '/repo/a',
            skill: 'review',
            enabled: true,
          },
          {
            name: 'Project B',
            platform: 'github',
            remoteUrl: 'https://github.com/owner/b.git',
            localPath: '/repo/b',
            skill: 'review',
            enabled: true,
          },
        ],
        reviewRequestTrackingGateway: tracking,
        sizeBlockListPresenter: new SizeBlockListPresenter(),
        forceLaunchBlockedReview: new ForceLaunchBlockedReviewUseCase({
          reviewRequestTrackingGateway: tracking,
          enqueue: async () => true,
          logger: createStubLogger(),
        }),
        resolveReviewProcessor: () => noopProcessor(),
        logger: createStubLogger(),
      });
    });

    it('panel populated: GET /api/size-blocks returns both blocked MRs', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/size-blocks' });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.isEmpty).toBe(false);
      expect(payload.blocks).toHaveLength(2);
      const projectNames = payload.blocks.map(
        (block: { projectName: string }) => block.projectName,
      );
      expect(projectNames).toContain('Project A');
      expect(projectNames).toContain('Project B');
    });

    it('force launch: enqueues review then clears the sizeBlock', async () => {
      const mrId = createTrackedMrId('gitlab', 'group/a', 1);
      const response = await app.inject({
        method: 'POST',
        url: '/api/mr-tracking/force-start',
        payload: { mrId, projectPath: '/repo/a' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(tracking.getById('/repo/a', mrId)?.sizeBlock).toBeNull();
    });
  });

  describe('Rule: a duplicate force-launch leaves the sizeBlock untouched', () => {
    it('force launch dedup: rejected enqueue keeps the block', async () => {
      const tracking = new InMemoryReviewRequestTrackingGateway();
      const mrId = createTrackedMrId('gitlab', 'group/a', 1);
      tracking.saveTracking(
        '/repo/a',
        MrTrackingDataFactory.withMrs([
          TrackedMrFactory.create({
            id: mrId,
            mrNumber: 1,
            project: 'group/a',
            sizeBlock: {
              countedLines: 2500,
              budget: 2000,
              message: 'trop gros',
              blockedAt: FIXED_NOW,
            },
          }),
        ]),
      );

      const forceLaunch = new ForceLaunchBlockedReviewUseCase({
        reviewRequestTrackingGateway: tracking,
        enqueue: async () => false,
        logger: createStubLogger(),
      });

      const job: ReviewJob = {
        id: 'job-1',
        platform: 'gitlab',
        projectPath: 'group/a',
        localPath: '/repo/a',
        mrNumber: 1,
        skill: 'review',
        mrUrl: 'https://gitlab.com/group/a/-/merge_requests/1',
        sourceBranch: 'feature',
        targetBranch: 'main',
        jobType: 'review',
      };

      const result = await forceLaunch.execute({
        projectPath: '/repo/a',
        mrId,
        job,
        processor: noopProcessor(),
      });

      expect(result).toBe('rejected-duplicate');
      expect(tracking.getById('/repo/a', mrId)?.sizeBlock).not.toBeNull();
    });
  });

  describe('Rule: maxDiffLines is editable through the project config', () => {
    it('config UI: maxDiffLines 1500 round-trips through the update use case', () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/project', baseConfig());
      const usecase = new UpdateProjectConfigUseCase(gateway);

      const result = usecase.execute({ path: '/repo/project', patch: { maxDiffLines: 1500 } });

      expect(result.status).toBe('success');
      expect(gateway.get('/repo/project')?.maxDiffLines).toBe(1500);
    });

    it('config UI invalid: a negative maxDiffLines is rejected', () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/project', baseConfig());
      const usecase = new UpdateProjectConfigUseCase(gateway);

      const result = usecase.execute({ path: '/repo/project', patch: { maxDiffLines: -5 } });

      expect(result.status).toBe('invalid');
    });
  });
});
