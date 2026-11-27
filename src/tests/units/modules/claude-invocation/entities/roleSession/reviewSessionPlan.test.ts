import { describe, expect, it } from 'vitest';

import { parseReviewOrchestrationSettings } from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import { reviewSessionPlanOf } from '@/modules/claude-invocation/entities/roleSession/reviewSessionPlan.js';

const SINGLE_TIMEOUT_MS = 15 * 60_000;
const orchestratedProject = parseReviewOrchestrationSettings({ mode: 'orchestrated' });

describe('reviewSessionPlanOf', () => {
  it('keeps a single review unnamed, on the skill alone, within the single timeout', () => {
    const plan = reviewSessionPlanOf({
      skill: 'review-front',
      mergeRequestNumber: 42,
      jobType: 'review',
      settings: null,
      singleTimeoutMs: SINGLE_TIMEOUT_MS,
    });

    expect(plan).toEqual({
      orchestrated: false,
      prompt: '/review-front 42',
      sessionName: null,
      timeoutMs: SINGLE_TIMEOUT_MS,
    });
  });

  it('runs an orchestrated review as the named clerk, with the orchestre argument and 45 minutes', () => {
    const plan = reviewSessionPlanOf({
      skill: 'practicio-review-code',
      mergeRequestNumber: 2111,
      jobType: 'review',
      settings: orchestratedProject,
      singleTimeoutMs: SINGLE_TIMEOUT_MS,
    });

    expect(plan).toEqual({
      orchestrated: true,
      prompt: '/practicio-review-code 2111 orchestre',
      sessionName: 'Revue #2111 · greffe',
      timeoutMs: 45 * 60_000,
    });
  });

  it('keeps the follow-up of an orchestrated project a single session', () => {
    const plan = reviewSessionPlanOf({
      skill: 'practicio-review-followup',
      mergeRequestNumber: 2111,
      jobType: 'followup',
      settings: orchestratedProject,
      singleTimeoutMs: SINGLE_TIMEOUT_MS,
    });

    expect(plan.orchestrated).toBe(false);
    expect(plan.prompt).toBe('/practicio-review-followup 2111');
    expect(plan.sessionName).toBeNull();
    expect(plan.timeoutMs).toBe(SINGLE_TIMEOUT_MS);
  });

  it('uses the orchestrated timeout the project configures', () => {
    const plan = reviewSessionPlanOf({
      skill: 'practicio-review-code',
      mergeRequestNumber: 7,
      jobType: 'review',
      settings: parseReviewOrchestrationSettings({
        mode: 'orchestrated',
        orchestratedTimeoutMinutes: 90,
      }),
      singleTimeoutMs: SINGLE_TIMEOUT_MS,
    });

    expect(plan.timeoutMs).toBe(90 * 60_000);
  });
});
