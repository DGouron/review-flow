import { describe, it, expect } from 'vitest';

import {
  computeCostUsd,
  MODEL_PRICING_USD_PER_MILLION,
} from '@/modules/token-accounting/entities/modelPricing/modelPricing.js';

describe('computeCostUsd', () => {
  it('returns 0 when every token field is zero', () => {
    const cost = computeCostUsd('claude-opus-4-7', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(0);
  });

  it('prices 1M input tokens at the opus rate (15 USD)', () => {
    const cost = computeCostUsd('claude-opus-4-7', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(15);
  });

  it('prices 1M input tokens at the sonnet rate (3 USD)', () => {
    const cost = computeCostUsd('claude-sonnet-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(3);
  });

  it('prices 1M input tokens at the haiku rate (1 USD)', () => {
    const cost = computeCostUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(1);
  });

  it('sums input, output, cache-creation and cache-read at their respective rates (sonnet tier)', () => {
    const cost = computeCostUsd('claude-sonnet-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      costUsd: 0,
    });

    expect(cost).toBeCloseTo(3 + 15 + 3.75 + 0.3, 6);
  });

  it('falls back to opus pricing for an unknown model (never under-reports)', () => {
    const cost = computeCostUsd('mystery-model-x', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(15);
  });

  it('matches versioned suffixes via prefix (claude-opus-4-7[1m] → opus tier)', () => {
    const cost = computeCostUsd('claude-opus-4-7[1m]', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(15);
  });

  it('matches the dated versioned suffix (claude-haiku-4-5-20251022 → haiku tier)', () => {
    const cost = computeCostUsd('claude-haiku-4-5-20251022', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
    });

    expect(cost).toBe(1);
  });

  it('exposes the public pricing table as a constant for inspection', () => {
    expect(MODEL_PRICING_USD_PER_MILLION).toHaveProperty('claude-opus-4');
    expect(MODEL_PRICING_USD_PER_MILLION).toHaveProperty('claude-sonnet-4');
    expect(MODEL_PRICING_USD_PER_MILLION).toHaveProperty('claude-haiku-4-5');
  });
});
