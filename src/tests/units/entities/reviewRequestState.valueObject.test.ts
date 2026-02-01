import { describe, it, expect } from 'vitest';
import { ReviewRequestState } from '../../../entities/reviewRequest/reviewRequestState.valueObject.js';

describe('ReviewRequestState', () => {
  describe('create', () => {
    it('should create from valid string', () => {
      const state = ReviewRequestState.create('pending-review');
      expect(state.current).toBe('pending-review');
    });

    it('should throw for invalid string', () => {
      expect(() => ReviewRequestState.create('invalid')).toThrow();
    });
  });

  describe('factory methods', () => {
    it('should create pendingReview state', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.current).toBe('pending-review');
    });

    it('should create pendingFix state', () => {
      const state = ReviewRequestState.pendingFix();
      expect(state.current).toBe('pending-fix');
    });
  });

  describe('transitions', () => {
    it('should allow valid transition from pending-review to pending-fix', () => {
      const state = ReviewRequestState.pendingReview();
      const newState = state.transitionTo('pending-fix');
      expect(newState.current).toBe('pending-fix');
    });

    it('should allow transition from pending-approval to approved', () => {
      const state = ReviewRequestState.pendingApproval();
      const newState = state.transitionTo('approved');
      expect(newState.current).toBe('approved');
    });

    it('should reject invalid transition from pending-review to merged', () => {
      const state = ReviewRequestState.pendingReview();
      expect(() => state.transitionTo('merged')).toThrow('Invalid state transition');
    });

    it('should not allow transitions from terminal states', () => {
      const merged = ReviewRequestState.create('merged');
      expect(() => merged.transitionTo('closed')).toThrow();
    });
  });

  describe('canTransitionTo', () => {
    it('should return true for valid transition', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.canTransitionTo('pending-fix')).toBe(true);
    });

    it('should return false for invalid transition', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.canTransitionTo('merged')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('should return true for merged state', () => {
      const state = ReviewRequestState.create('merged');
      expect(state.isTerminal).toBe(true);
    });

    it('should return true for closed state', () => {
      const state = ReviewRequestState.create('closed');
      expect(state.isTerminal).toBe(true);
    });

    it('should return false for pending states', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.isTerminal).toBe(false);
    });
  });

  describe('needsAction', () => {
    it('should return true for pending-fix', () => {
      const state = ReviewRequestState.pendingFix();
      expect(state.needsAction).toBe(true);
    });

    it('should return true for pending-review', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.needsAction).toBe(true);
    });

    it('should return false for approved', () => {
      const state = ReviewRequestState.create('approved');
      expect(state.needsAction).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same state', () => {
      const state1 = ReviewRequestState.pendingReview();
      const state2 = ReviewRequestState.pendingReview();
      expect(state1.equals(state2)).toBe(true);
    });

    it('should return false for different states', () => {
      const state1 = ReviewRequestState.pendingReview();
      const state2 = ReviewRequestState.pendingFix();
      expect(state1.equals(state2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the state value', () => {
      const state = ReviewRequestState.pendingReview();
      expect(state.toString()).toBe('pending-review');
    });
  });
});
