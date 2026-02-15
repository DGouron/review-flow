import { describe, expect, it } from 'vitest';
import { resolveReviewAssigneeDisplay } from '@/interface-adapters/views/dashboard/modules/assignee.js';

describe('resolveReviewAssigneeDisplay', () => {
  it('should prioritize assignee from review payload', () => {
    const result = resolveReviewAssigneeDisplay(
      {
        mrNumber: 42,
        assignedBy: { displayName: 'Alice Reviewer', username: 'alice' },
      },
      [
        {
          mrNumber: 42,
          assignment: { displayName: 'Bob Owner', username: 'bob' },
        },
      ],
    );

    expect(result).toBe('Alice Reviewer');
  });

  it('should fallback to merge request assignee when followup has no assignedBy', () => {
    const result = resolveReviewAssigneeDisplay(
      {
        mrNumber: 42,
        jobType: 'followup',
      },
      [
        {
          mrNumber: 42,
          assignment: { displayName: 'Bob Owner', username: 'bob' },
        },
      ],
    );

    expect(result).toBe('Bob Owner');
  });

  it('should fallback to unknown when no assignee can be resolved', () => {
    const result = resolveReviewAssigneeDisplay(
      {
        mrNumber: 42,
      },
      [],
    );

    expect(result).toBe('unknown');
  });
});
