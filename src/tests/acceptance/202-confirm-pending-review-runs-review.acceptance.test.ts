import { describe, it, expect, beforeEach } from 'vitest';

import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type {
  PendingReviewRequest,
  TriggerSource,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import { ProcessorRegistry } from '@/modules/review-execution/services/processorRegistry.js';
import type { ProcessorBuilder } from '@/modules/review-execution/services/processorRegistry.js';
import { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import type { GateClaudeInvocationProcessor } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import { PendingReviewRequestFactory } from '@/tests/factories/pendingReviewRequest.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { StubPendingReviewRequestGateway } from '@/tests/stubs/pendingReviewRequest.stub.js';

type Platform = 'gitlab' | 'github';

interface RunRecord {
  platform: Platform;
  jobType: 'review' | 'followup';
  jobId: string;
}

class AcceptanceWorld {
  readonly gateway = new StubPendingReviewRequestGateway();
  readonly registry = new ProcessorRegistry();
  readonly activeJobs = new Set<string>();
  readonly enqueued: ReviewJob[] = [];
  readonly runs: RunRecord[] = [];
  private readonly configuredProjectPaths = new Set<string>();
  private readonly logger = createStubLogger();

  configureProject(projectPath: string): void {
    this.configuredProjectPaths.add(projectPath);
  }

  registerPlatformBuilders(platform: Platform): void {
    const builder = this.buildRecordingBuilder(platform);
    const triggerSources: TriggerSource[] = [
      'webhook-initial',
      'webhook-followup',
      'dashboard-manual',
    ];
    for (const triggerSource of triggerSources) {
      this.registry.register({ triggerSource, platform, jobType: 'review' }, builder);
      this.registry.register({ triggerSource, platform, jobType: 'followup' }, builder);
    }
  }

  private buildRecordingBuilder(platform: Platform): ProcessorBuilder {
    return (job: ReviewJob): GateClaudeInvocationProcessor =>
      async (runJob: ReviewJob): Promise<void> => {
        if (!this.configuredProjectPaths.has(runJob.projectPath)) {
          throw new Error(`No repository configured for projectPath "${runJob.projectPath}"`);
        }
        const jobType = job.jobType === 'followup' ? 'followup' : 'review';
        this.runs.push({ platform, jobType, jobId: runJob.id });
      };
  }

  makeUseCase(): ConfirmPendingReviewUseCase {
    return new ConfirmPendingReviewUseCase({
      pendingReviewRequestGateway: this.gateway,
      queuePort: {
        hasActiveJob: (id) => this.activeJobs.has(id),
        getJobStatus: () => null,
      },
      enqueue: async (job, processor) => {
        this.enqueued.push(job);
        this.activeJobs.add(job.id);
        await processor(job, new AbortController().signal);
        return true;
      },
      resolveProcessor: (pending) => this.registry.resolve(pending),
      isProjectRunnable: (pending) => this.configuredProjectPaths.has(pending.job.projectPath),
      logger: this.logger,
    });
  }
}

const PLATFORMS: ReadonlyArray<{ platform: Platform; pending: () => PendingReviewRequest }> = [
  {
    platform: 'gitlab',
    pending: () => PendingReviewRequestFactory.create(),
  },
  {
    platform: 'github',
    pending: () => PendingReviewRequestFactory.github(),
  },
];

describe('Confirm a parked review runs the real review (acceptance, spec-202)', () => {
  let world: AcceptanceWorld;

  beforeEach(() => {
    world = new AcceptanceWorld();
  });

  for (const { platform, pending: makePending } of PLATFORMS) {
    describe(`platform: ${platform}`, () => {
      describe('Rule: confirming a parked review runs the full review', () => {
        it('confirmed runs review: enqueues and runs the real processor, leaving the waiting list', async () => {
          const pending = makePending();
          world.configureProject(pending.job.projectPath);
          world.registerPlatformBuilders(platform);
          world.gateway.prepopulate(pending);

          const result = await world
            .makeUseCase()
            .execute({ pendingId: pending.pendingReviewRequestId });

          expect(result.status).toBe('confirmed');
          expect(world.enqueued).toHaveLength(1);
          expect(world.runs).toEqual([{ platform, jobType: 'review', jobId: pending.job.id }]);
          expect(await world.gateway.listAll()).toHaveLength(0);
        });
      });

      describe('Rule: confirmation works even after a server restart', () => {
        it('survives restart: rebuilds registry and use case from the persisted snapshot only', async () => {
          const persisted = makePending();
          world.gateway.prepopulate(persisted);

          const rebornWorld = new AcceptanceWorld();
          rebornWorld.gateway.prepopulate(persisted);
          rebornWorld.configureProject(persisted.job.projectPath);
          rebornWorld.registerPlatformBuilders(platform);

          const result = await rebornWorld
            .makeUseCase()
            .execute({ pendingId: persisted.pendingReviewRequestId });

          expect(result.status).toBe('confirmed');
          expect(rebornWorld.runs).toEqual([
            { platform, jobType: 'review', jobId: persisted.job.id },
          ]);
        });
      });

      describe('Rule: the kind of run is preserved from the original trigger', () => {
        it('follow-up preserved: a parked follow-up runs a follow-up review', async () => {
          const base = makePending();
          const pending: PendingReviewRequest = {
            ...base,
            jobType: 'followup',
            job: { ...base.job, jobType: 'followup' },
          };
          world.configureProject(pending.job.projectPath);
          world.registerPlatformBuilders(platform);
          world.gateway.prepopulate(pending);

          const result = await world
            .makeUseCase()
            .execute({ pendingId: pending.pendingReviewRequestId });

          expect(result.status).toBe('confirmed');
          expect(world.runs).toEqual([{ platform, jobType: 'followup', jobId: pending.job.id }]);
        });
      });

      describe('Rule: a project no longer configured cannot run', () => {
        it('project no longer available: rejects with the French message and keeps the waiting list', async () => {
          const pending = makePending();
          world.registerPlatformBuilders(platform);
          world.gateway.prepopulate(pending);

          const result = await world
            .makeUseCase()
            .execute({ pendingId: pending.pendingReviewRequestId });

          expect(result.status).toBe('project-not-configured');
          if (result.status === 'project-not-configured') {
            expect(result.message).toBe("Le projet associé n'est plus configuré");
          }
          expect(world.enqueued).toHaveLength(0);
          expect(world.runs).toHaveLength(0);
          expect(await world.gateway.listAll()).toHaveLength(1);
        });
      });
    });
  }

  describe('Rule: a review already queued or running cannot be started again', () => {
    it('already running: rejects with the exact French message and never enqueues', async () => {
      const pending = PendingReviewRequestFactory.create();
      world.configureProject(pending.job.projectPath);
      world.registerPlatformBuilders('gitlab');
      world.gateway.prepopulate(pending);
      world.activeJobs.add(pending.job.id);

      const result = await world
        .makeUseCase()
        .execute({ pendingId: pending.pendingReviewRequestId });

      expect(result.status).toBe('already-running');
      if (result.status === 'already-running') {
        expect(result.message).toBe('Cette review est déjà en cours');
      }
      expect(world.enqueued).toHaveLength(0);
    });
  });

  describe('Rule: a parked review that no longer exists cannot be confirmed', () => {
    it('unknown request: rejects with not-found', async () => {
      world.registerPlatformBuilders('gitlab');

      const result = await world.makeUseCase().execute({ pendingId: 'does-not-exist' });

      expect(result.status).toBe('not-found');
    });
  });
});
