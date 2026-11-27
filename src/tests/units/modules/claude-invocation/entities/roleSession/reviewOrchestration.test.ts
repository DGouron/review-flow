import { describe, expect, it } from 'vitest';

import {
  isOrchestratedReview,
  modelForRole,
  orchestratedReviewTimeoutMs,
  parseReviewOrchestrationSettings,
  reviewModeOf,
  roleSessionTimeoutMs,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';

describe('review orchestration settings', () => {
  it('uses the default model of each role when nothing is configured', () => {
    expect(modelForRole(null, 'greffe')).toBe('sonnet');
    expect(modelForRole(null, 'lot:bugs')).toBe('opus');
    expect(modelForRole(null, 'lot:architecture')).toBe('opus');
    expect(modelForRole(null, 'lot:lisibilite')).toBe('sonnet');
    expect(modelForRole(null, 'lot:tests')).toBe('sonnet');
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

  it('keeps a config written for the retired security lot valid, and ignores that lot', () => {
    const settings = parseReviewOrchestrationSettings({
      roles: { 'lot:securite': { model: 'sonnet' }, 'lot:bugs': { model: 'sonnet' } },
    });

    expect(settings.roles).toEqual({ 'lot:bugs': { model: 'sonnet' } });
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

  it('orchestrates only the review jobs of a project in orchestrated mode, never a follow-up', () => {
    const orchestrated = parseReviewOrchestrationSettings({ mode: 'orchestrated' });

    expect(isOrchestratedReview(orchestrated, 'review')).toBe(true);
    expect(isOrchestratedReview(orchestrated, 'followup')).toBe(false);
    expect(isOrchestratedReview(parseReviewOrchestrationSettings({}), 'review')).toBe(false);
    expect(isOrchestratedReview(null, 'review')).toBe(false);
  });

  it('gives an orchestrated review 45 minutes and each role session 15 minutes by default', () => {
    expect(orchestratedReviewTimeoutMs(null)).toBe(45 * 60_000);
    expect(roleSessionTimeoutMs(null)).toBe(15 * 60_000);
    expect(roleSessionTimeoutMs(parseReviewOrchestrationSettings({}))).toBe(15 * 60_000);
  });

  it('reads the configured timeouts in minutes', () => {
    const settings = parseReviewOrchestrationSettings({
      orchestratedTimeoutMinutes: 60,
      roleTimeoutMinutes: 20,
    });

    expect(orchestratedReviewTimeoutMs(settings)).toBe(60 * 60_000);
    expect(roleSessionTimeoutMs(settings)).toBe(20 * 60_000);
  });

  it('rejects a timeout that is not a whole number of minutes within bounds', () => {
    expect(() => parseReviewOrchestrationSettings({ orchestratedTimeoutMinutes: 2 })).toThrow(
      /review\.orchestratedTimeoutMinutes/,
    );
    expect(() => parseReviewOrchestrationSettings({ roleTimeoutMinutes: 1.5 })).toThrow(
      /review\.roleTimeoutMinutes/,
    );
  });
});
