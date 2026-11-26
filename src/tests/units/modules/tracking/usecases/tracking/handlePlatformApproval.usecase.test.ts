import { describe, it, expect } from 'vitest';

import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { ReviewEventFactory } from '@/tests/factories/reviewEvent.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/project';
const MR_ID = 'mr-1';

function approvalOn(
  mr: Parameters<typeof TrackedMrFactory.create>[0],
  threshold: 'A' | 'B' | null,
) {
  const gateway = new InMemoryReviewRequestTrackingGateway();
  gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID, ...mr }));
  return new HandlePlatformApprovalUseCase(gateway).execute({
    projectPath: PROJECT_PATH,
    mrId: MR_ID,
    qualityThreshold: threshold,
  });
}

describe('HandlePlatformApprovalUseCase', () => {
  it('returns mr-not-found when the merge request is not tracked', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new HandlePlatformApprovalUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: 'unknown-mr',
      qualityThreshold: 'B',
    });

    expect(result).toEqual({ kind: 'mr-not-found' });
  });

  it('returns bypass-active when the merge request has an active bypass', () => {
    const result = approvalOn(
      {
        openThreads: 2,
        reviews: [ReviewEventFactory.create({ verdict: 'changes', grade: 'D' })],
        bypass: {
          author: 'alice',
          reason: 'hotfix critique',
          recordedAt: '2026-05-25T08:00:00.000Z',
        },
      },
      'B',
    );

    expect(result).toEqual({ kind: 'bypass-active' });
  });

  it('returns allowed when no threshold is configured', () => {
    const result = approvalOn({ reviews: [] }, null);

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('returns allowed when the latest review is ready within the threshold', () => {
    const result = approvalOn(
      { reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })] },
      'B',
    );

    expect(result).toEqual({ kind: 'allowed' });
  });

  it('reverts an approval given before any review verdict', () => {
    const result = approvalOn({ reviews: [] }, 'B');

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'verdict-missing',
      message:
        'Approbation annulée : aucun verdict de review : approbation impossible. Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });

  it('reverts an approval on a review to rework', () => {
    const result = approvalOn(
      { reviews: [ReviewEventFactory.create({ verdict: 'changes', grade: 'C' })] },
      'B',
    );

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'not-ready',
      message:
        'Approbation annulée : review à reprendre : approbation impossible. Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });

  it('reverts an approval below the grade threshold', () => {
    const result = approvalOn(
      { reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'B' })] },
      'A',
    );

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'below-threshold',
      message:
        'Approbation annulée : niveau qualité non atteint (B, seuil A). Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });

  it('reverts an approval while threads remain open', () => {
    const result = approvalOn(
      { openThreads: 2, reviews: [ReviewEventFactory.create({ verdict: 'ready', grade: 'A' })] },
      'B',
    );

    expect(result).toEqual({
      kind: 'reverted',
      reason: 'blockers-present',
      message:
        'Approbation annulée : issues bloquantes non résolues. Utilisez `/bypass-quality "raison"` pour forcer.',
    });
  });
});
