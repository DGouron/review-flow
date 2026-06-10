import { describe, it, expect } from 'vitest';

import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/project';
const MR_ID = 'mr-1';

describe('HandlePlatformApprovalUseCase', () => {
  it('returns mr-not-found when the merge request is not tracked', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: 'unknown-mr',
      qualityThreshold: 7,
    });

    expect(result).toEqual({ kind: 'mr-not-found' });
  });

  it('returns bypass-active when the merge request has an active bypass', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      PROJECT_PATH,
      TrackedMrFactory.create({
        id: MR_ID,
        latestScore: 5,
        openThreads: 2,
        bypass: {
          author: 'alice',
          reason: 'hotfix critique',
          recordedAt: '2026-05-25T08:00:00.000Z',
        },
      }),
    );
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({ kind: 'bypass-active' });
  });

  it('returns allowed when no review has completed yet (latestScore null)', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID, latestScore: null }));
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('returns allowed when no threshold is configured', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID, latestScore: 6 }));
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: null,
    });

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('returns allowed when the score is above the threshold and no blockers', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      PROJECT_PATH,
      TrackedMrFactory.create({ id: MR_ID, latestScore: 8, openThreads: 0 }),
    );
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('returns allowed at the threshold boundary (score equals threshold)', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      PROJECT_PATH,
      TrackedMrFactory.create({ id: MR_ID, latestScore: 7, openThreads: 0 }),
    );
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('returns reverted with the below-threshold FR message when score is below threshold', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      PROJECT_PATH,
      TrackedMrFactory.create({ id: MR_ID, latestScore: 6, openThreads: 0 }),
    );
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'below-threshold',
      threshold: 7,
      latestScore: 6,
      message:
        'Approbation annulée : seuil qualité 7/10 non atteint (6/10). Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });

  it('returns reverted with the blockers-present FR message when open threads remain', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(
      PROJECT_PATH,
      TrackedMrFactory.create({ id: MR_ID, latestScore: 9, openThreads: 2 }),
    );
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      qualityThreshold: 7,
    });

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'blockers-present',
      threshold: 7,
      latestScore: 9,
      message:
        'Approbation annulée : issues bloquantes non résolues. Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });
});
