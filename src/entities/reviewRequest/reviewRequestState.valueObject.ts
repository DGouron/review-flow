import { z } from 'zod';

export const ReviewRequestStateSchema = z.enum([
  'pending-review',
  'pending-fix',
  'pending-approval',
  'approved',
  'merged',
  'closed',
]);

export type ReviewRequestStateValue = z.infer<typeof ReviewRequestStateSchema>;

const VALID_TRANSITIONS: Record<ReviewRequestStateValue, ReviewRequestStateValue[]> = {
  'pending-review': ['pending-fix', 'pending-approval', 'closed'],
  'pending-fix': ['pending-review', 'pending-approval', 'closed'],
  'pending-approval': ['approved', 'pending-fix', 'closed'],
  'approved': ['merged', 'closed'],
  'merged': [],
  'closed': [],
};

export class ReviewRequestState {
  private constructor(private readonly value: ReviewRequestStateValue) {}

  static create(value: string): ReviewRequestState {
    const parsed = ReviewRequestStateSchema.parse(value);
    return new ReviewRequestState(parsed);
  }

  static pendingReview(): ReviewRequestState {
    return new ReviewRequestState('pending-review');
  }

  static pendingFix(): ReviewRequestState {
    return new ReviewRequestState('pending-fix');
  }

  static pendingApproval(): ReviewRequestState {
    return new ReviewRequestState('pending-approval');
  }

  get current(): ReviewRequestStateValue {
    return this.value;
  }

  canTransitionTo(target: ReviewRequestStateValue): boolean {
    return VALID_TRANSITIONS[this.value].includes(target);
  }

  transitionTo(target: ReviewRequestStateValue): ReviewRequestState {
    if (!this.canTransitionTo(target)) {
      throw new Error(`Invalid state transition: ${this.value} → ${target}`);
    }
    return new ReviewRequestState(target);
  }

  get isTerminal(): boolean {
    return this.value === 'merged' || this.value === 'closed';
  }

  get needsAction(): boolean {
    return this.value === 'pending-fix' || this.value === 'pending-review';
  }

  equals(other: ReviewRequestState): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
