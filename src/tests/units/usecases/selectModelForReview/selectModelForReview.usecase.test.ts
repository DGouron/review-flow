import { describe, it, expect } from 'vitest';

import { SelectModelForReviewUseCase } from '@/modules/review-execution/usecases/selectModelForReview/selectModelForReview.usecase.js';
import { RoutingPolicyFactory } from '@/tests/factories/routingPolicy.factory.js';

describe('SelectModelForReviewUseCase', () => {
  const useCase = new SelectModelForReviewUseCase();

  it('returns defaultModel when policy is null', () => {
    const result = useCase.execute({
      diffStats: { additions: 200, deletions: 100 },
      policy: null,
      defaultModel: 'opus',
    });

    expect(result).toBe('opus');
  });

  it('returns haiku for a 30-line MR with standard policy', () => {
    const result = useCase.execute({
      diffStats: { additions: 20, deletions: 10 },
      policy: RoutingPolicyFactory.create(),
      defaultModel: 'opus',
    });

    expect(result).toBe('haiku');
  });

  it('returns sonnet for a 200-line MR with standard policy', () => {
    const result = useCase.execute({
      diffStats: { additions: 150, deletions: 50 },
      policy: RoutingPolicyFactory.create(),
      defaultModel: 'opus',
    });

    expect(result).toBe('sonnet');
  });

  it('returns opus for a 1000-line MR with standard policy', () => {
    const result = useCase.execute({
      diffStats: { additions: 600, deletions: 400 },
      policy: RoutingPolicyFactory.create(),
      defaultModel: 'haiku',
    });

    expect(result).toBe('opus');
  });

  it('returns haiku for exactly 50 lines (boundary inclusive)', () => {
    const result = useCase.execute({
      diffStats: { additions: 30, deletions: 20 },
      policy: RoutingPolicyFactory.create(),
      defaultModel: 'opus',
    });

    expect(result).toBe('haiku');
  });

  it('returns sonnet for exactly 51 lines', () => {
    const result = useCase.execute({
      diffStats: { additions: 30, deletions: 21 },
      policy: RoutingPolicyFactory.create(),
      defaultModel: 'opus',
    });

    expect(result).toBe('sonnet');
  });
});
