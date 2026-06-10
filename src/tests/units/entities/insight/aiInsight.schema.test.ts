import { describe, it, expect } from 'vitest';

import {
  aiDeveloperInsightSchema,
  aiTeamInsightSchema,
  aiInsightsResultSchema,
} from '@/modules/statistics-insights/entities/insight/aiInsight.schema.js';

describe('aiDeveloperInsightSchema', () => {
  it('should validate a valid developer insight', () => {
    const input = {
      developerName: 'alice',
      title: 'Le Chirurgien du Code',
      titleExplanation: 'Precise and methodical in code changes',
      strengths: ['Excellent test coverage', 'Clean architecture'],
      weaknesses: ['Slow review turnaround'],
      recommendations: ['Focus on reducing blocking issues'],
      summary: 'Alice is a meticulous developer with strong testing habits.',
    };

    const result = aiDeveloperInsightSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject when developerName is empty', () => {
    const input = {
      developerName: '',
      title: 'Title',
      titleExplanation: 'Explanation',
      strengths: ['Strength'],
      weaknesses: ['Weakness'],
      recommendations: ['Recommendation'],
      summary: 'Summary',
    };

    const result = aiDeveloperInsightSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject when strengths is not an array', () => {
    const input = {
      developerName: 'alice',
      title: 'Title',
      titleExplanation: 'Explanation',
      strengths: 'not an array',
      weaknesses: ['Weakness'],
      recommendations: ['Recommendation'],
      summary: 'Summary',
    };

    const result = aiDeveloperInsightSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('aiTeamInsightSchema', () => {
  it('should validate a valid team insight', () => {
    const input = {
      summary: 'A well-balanced team with strong testing culture.',
      strengths: ['Consistent code quality'],
      weaknesses: ['Documentation gaps'],
      recommendations: ['Establish code review guidelines'],
      dynamics: 'The team complements each other well.',
    };

    const result = aiTeamInsightSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject when summary is missing', () => {
    const input = {
      strengths: ['Strength'],
      weaknesses: ['Weakness'],
      recommendations: ['Recommendation'],
      dynamics: 'Dynamics',
    };

    const result = aiTeamInsightSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('aiInsightsResultSchema', () => {
  it('should validate a complete AI insights result', () => {
    const input = {
      developers: [
        {
          developerName: 'alice',
          title: 'Le Chirurgien du Code',
          titleExplanation: 'Precise and methodical',
          strengths: ['Testing'],
          weaknesses: ['Speed'],
          recommendations: ['Automate more'],
          summary: 'Alice is great.',
        },
      ],
      team: {
        summary: 'Good team.',
        strengths: ['Quality'],
        weaknesses: ['Velocity'],
        recommendations: ['Pair programming'],
        dynamics: 'Balanced.',
      },
      generatedAt: '2026-03-15T10:00:00Z',
    };

    const result = aiInsightsResultSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept empty developers array', () => {
    const input = {
      developers: [],
      team: {
        summary: 'No data.',
        strengths: [],
        weaknesses: [],
        recommendations: [],
        dynamics: 'No dynamics.',
      },
      generatedAt: '2026-03-15T10:00:00Z',
    };

    const result = aiInsightsResultSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject when generatedAt is missing', () => {
    const input = {
      developers: [],
      team: {
        summary: 'Summary.',
        strengths: [],
        weaknesses: [],
        recommendations: [],
        dynamics: 'Dynamics.',
      },
    };

    const result = aiInsightsResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
