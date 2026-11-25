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

describe('computeCostUsd on the 5.x models', () => {
  const million = (
    field: 'inputTokens' | 'outputTokens' | 'cacheCreationInputTokens' | 'cacheReadInputTokens',
  ) => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0,
    [field]: 1_000_000,
  });

  it.each([
    ['claude-opus-5-5', 4, 20, 8, 0.2],
    ['claude-opus-5', 5, 25, 10, 0.5],
    ['claude-sonnet-5-5', 2, 10, 4, 0.1],
    ['claude-haiku-5-5', 0.1, 0.5, 0.2, 0.01],
    ['claude-fable-5-2', 8, 40, 16, 0.2],
  ])(
    'prices %s per million: input %s, output %s, one-hour cache write %s, cache read %s',
    (model, input, output, cacheWrite, cacheRead) => {
      expect(computeCostUsd(model, million('inputTokens'))).toBeCloseTo(input, 6);
      expect(computeCostUsd(model, million('outputTokens'))).toBeCloseTo(output, 6);
      expect(computeCostUsd(model, million('cacheCreationInputTokens'))).toBeCloseTo(cacheWrite, 6);
      expect(computeCostUsd(model, million('cacheReadInputTokens'))).toBeCloseTo(cacheRead, 6);
    },
  );
});
