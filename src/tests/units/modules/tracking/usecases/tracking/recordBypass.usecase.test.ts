import { describe, it, expect } from 'vitest';

import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const PROJECT_PATH = '/project';
const MR_ID = 'mr-1';
const FIXED_NOW = '2026-05-26T12:00:00.000Z';
const now = (): string => FIXED_NOW;

describe('RecordBypassUseCase', () => {
  it('returns no-marker when the comment does not contain the marker', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID }));
    const useCase = new RecordBypassUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      commentBody: 'LGTM, ship it',
      author: 'alice',
      now,
    });

    expect(result).toEqual({ kind: 'no-marker' });
    expect(gateway.getById(PROJECT_PATH, MR_ID)?.bypass).toBeNull();
  });

  it('returns rejected-missing-reason with the French message for a bare marker', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID }));
    const useCase = new RecordBypassUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      commentBody: '/bypass-quality',
      author: 'alice',
      now,
    });

    expect(result).toEqual({
      kind: 'rejected-missing-reason',
      message:
        'Le bypass nécessite une raison explicite. Format attendu : /bypass-quality "raison"',
    });
    expect(gateway.getById(PROJECT_PATH, MR_ID)?.bypass).toBeNull();
  });

  it('returns mr-not-found when the merge request is not tracked', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new RecordBypassUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: 'unknown-mr',
      commentBody: '/bypass-quality "hotfix"',
      author: 'alice',
      now,
    });

    expect(result).toEqual({ kind: 'mr-not-found' });
  });

  it('records the bypass on the tracked MR and returns the recorded payload', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    gateway.create(PROJECT_PATH, TrackedMrFactory.create({ id: MR_ID, state: 'pending-approval' }));
    const useCase = new RecordBypassUseCase(gateway);

    const result = useCase.execute({
      projectPath: PROJECT_PATH,
      mrId: MR_ID,
      commentBody: '/bypass-quality "hotfix critique"',
      author: 'alice',
      now,
    });

    expect(result).toEqual({
      kind: 'recorded',
      bypass: { author: 'alice', reason: 'hotfix critique', recordedAt: FIXED_NOW },
    });

    const persisted = gateway.getById(PROJECT_PATH, MR_ID);
    expect(persisted?.bypass).toEqual({
      author: 'alice',
      reason: 'hotfix critique',
      recordedAt: FIXED_NOW,
    });
    expect(persisted?.state).toBe('pending-approval');
  });
});
