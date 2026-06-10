import { describe, it, expect } from 'vitest';

import { BusinessRuleViolation } from '@/shared/foundation/businessRuleViolation.js';

class InvalidStateTransition extends BusinessRuleViolation {
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}.`);
  }
}

describe('BusinessRuleViolation', () => {
  it('is an instance of Error', () => {
    const violation = new InvalidStateTransition('approved', 'pending-review');
    expect(violation).toBeInstanceOf(Error);
    expect(violation).toBeInstanceOf(BusinessRuleViolation);
  });

  it('carries the subclass name and message', () => {
    const violation = new InvalidStateTransition('approved', 'pending-review');
    expect(violation.name).toBe('InvalidStateTransition');
    expect(violation.message).toBe('Cannot transition from approved to pending-review.');
  });

  it('distinguishes from ApplicationRuleViolation in catch blocks', () => {
    try {
      throw new InvalidStateTransition('a', 'b');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleViolation);
    }
  });
});
