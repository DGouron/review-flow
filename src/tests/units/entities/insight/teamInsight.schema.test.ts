import { describe, it, expect } from 'vitest';

import { teamInsightSchema } from '@/modules/statistics-insights/entities/insight/teamInsight.schema.js';
import { TeamInsightFactory } from '@/tests/factories/teamInsight.factory.js';

describe('TeamInsight schema', () => {
  it('should validate a complete team insight', () => {
    const insight = TeamInsightFactory.create();

    const result = teamInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should require developer count', () => {
    const insight = TeamInsightFactory.create();
    const { developerCount: _, ...withoutCount } = insight;

    const result = teamInsightSchema.safeParse(withoutCount);

    expect(result.success).toBe(false);
  });

  it('should accept empty strengths and weaknesses arrays', () => {
    const insight = TeamInsightFactory.create({
      strengths: [],
      weaknesses: [],
    });

    const result = teamInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should validate strengths contain valid categories', () => {
    const insight = TeamInsightFactory.create({
      strengths: ['invalid'],
    });

    const result = teamInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate average levels are between 1 and 10', () => {
    const insight = TeamInsightFactory.create({
      averageLevels: {
        quality: 11,
        responsiveness: 5,
        codeVolume: 5,
        iteration: 5,
      },
    });

    const result = teamInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should accept empty tips array', () => {
    const insight = TeamInsightFactory.create({
      tips: [],
    });

    const result = teamInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should require total review count', () => {
    const insight = TeamInsightFactory.create();
    const { totalReviewCount: _, ...withoutTotal } = insight;

    const result = teamInsightSchema.safeParse(withoutTotal);

    expect(result.success).toBe(false);
  });
});
