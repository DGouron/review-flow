import { describe, it, expect } from 'vitest';

import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { parseAiInsightsResponse } from '@/modules/statistics-insights/usecases/insights/parseAiInsightsResponse.js';

const validAiResult: AiInsightsResult = {
  developers: [
    {
      developerName: 'alice',
      title: 'Le Chirurgien du Code',
      titleExplanation: 'Precise and methodical',
      strengths: ['Excellent test coverage'],
      weaknesses: ['Slow review turnaround'],
      recommendations: ['Automate repetitive checks'],
      summary: 'Alice is a meticulous developer.',
    },
  ],
  team: {
    summary: 'A well-balanced team.',
    strengths: ['Strong testing culture'],
    weaknesses: ['Documentation gaps'],
    recommendations: ['Establish review guidelines'],
    dynamics: 'Good team dynamics.',
  },
  generatedAt: '2026-03-15T10:00:00Z',
};

describe('parseAiInsightsResponse', () => {
  it('parses a raw JSON answer into the insights shape', () => {
    const result = parseAiInsightsResponse(JSON.stringify(validAiResult));

    expect(result.developers[0].developerName).toBe('alice');
    expect(result.team.summary).toBe('A well-balanced team.');
  });

  it('strips a ```json fence before parsing', () => {
    const result = parseAiInsightsResponse('```json\n' + JSON.stringify(validAiResult) + '\n```');

    expect(result.developers).toHaveLength(1);
  });

  it('strips a bare ``` fence before parsing', () => {
    const result = parseAiInsightsResponse('```\n' + JSON.stringify(validAiResult) + '\n```');

    expect(result.team.dynamics).toBe('Good team dynamics.');
  });

  it('throws on a non-JSON answer', () => {
    expect(() => parseAiInsightsResponse('this is not JSON')).toThrow();
  });

  it('throws when the JSON does not match the insights schema', () => {
    expect(() => parseAiInsightsResponse('{"developers":"nope"}')).toThrow();
  });
});
