import { describe, expect, it } from 'vitest';

import {
  modelForRole,
  parseReviewOrchestrationSettings,
  reviewModeOf,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';

describe('review orchestration settings', () => {
  it('uses the default model of each role when nothing is configured', () => {
    expect(modelForRole(null, 'greffe')).toBe('sonnet');
    expect(modelForRole(null, 'lot:bugs')).toBe('opus');
    expect(modelForRole(null, 'lot:securite')).toBe('opus');
    expect(modelForRole(null, 'lot:architecture')).toBe('sonnet');
    expect(modelForRole(null, 'lot:lisibilite')).toBe('sonnet');
    expect(modelForRole(null, 'contradiction')).toBe('opus');
    expect(modelForRole(null, 'arbitre')).toBe('opus');
  });

  it('defaults to the single mode', () => {
    expect(reviewModeOf(null)).toBe('single');
    expect(reviewModeOf(parseReviewOrchestrationSettings({}))).toBe('single');
  });

  it('reads the configured mode and overrides only the configured roles', () => {
    const settings = parseReviewOrchestrationSettings({
      mode: 'orchestrated',
      roles: { 'lot:lisibilite': { model: 'opus' } },
    });

    expect(reviewModeOf(settings)).toBe('orchestrated');
    expect(modelForRole(settings, 'lot:lisibilite')).toBe('opus');
    expect(modelForRole(settings, 'greffe')).toBe('sonnet');
  });

  it('rejects an unknown mode, role or model', () => {
    expect(() => parseReviewOrchestrationSettings({ mode: 'parallel' })).toThrow(/review\.mode/);
    expect(() =>
      parseReviewOrchestrationSettings({ roles: { 'lot:perf': { model: 'opus' } } }),
    ).toThrow(/review\.roles/);
    expect(() =>
      parseReviewOrchestrationSettings({ roles: { arbitre: { model: 'gpt' } } }),
    ).toThrow(/review\.roles/);
  });

  it('rejects a review value that is not an object', () => {
    expect(() => parseReviewOrchestrationSettings('orchestrated')).toThrow(/review/);
  });
});
