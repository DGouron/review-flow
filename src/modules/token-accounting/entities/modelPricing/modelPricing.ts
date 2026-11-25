import type { TokenUsage } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

interface ModelRates {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}

/**
 * Anthropic public pricing per 1M tokens.
 * Last updated: 2026-11-25 - source: https://www.anthropic.com/pricing
 * Refresh on Claude model family bumps.
 * The 5.x cache writes are priced at the one-hour rate (2x input): that is the cache Claude Code writes.
 */
export const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelRates> = {
  'claude-fable-5-2': {
    inputPerMillion: 8,
    outputPerMillion: 40,
    cacheCreationPerMillion: 16,
    cacheReadPerMillion: 0.2,
  },
  'claude-opus-5-5': {
    inputPerMillion: 4,
    outputPerMillion: 20,
    cacheCreationPerMillion: 8,
    cacheReadPerMillion: 0.2,
  },
  'claude-opus-5': {
    inputPerMillion: 5,
    outputPerMillion: 25,
    cacheCreationPerMillion: 10,
    cacheReadPerMillion: 0.5,
  },
  'claude-sonnet-5-5': {
    inputPerMillion: 2,
    outputPerMillion: 10,
    cacheCreationPerMillion: 4,
    cacheReadPerMillion: 0.1,
  },
  'claude-haiku-5-5': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheCreationPerMillion: 0.2,
    cacheReadPerMillion: 0.01,
  },
  'claude-opus-4': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-sonnet-4': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-haiku-4-5': {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cacheCreationPerMillion: 1.25,
    cacheReadPerMillion: 0.1,
  },
};

const FALLBACK_RATES: ModelRates = MODEL_PRICING_USD_PER_MILLION['claude-opus-4'];

function resolveRates(model: string): ModelRates {
  const longestMatchingPrefix = Object.keys(MODEL_PRICING_USD_PER_MILLION)
    .filter((prefix) => model.startsWith(prefix))
    .toSorted((a, b) => b.length - a.length)[0];
  return longestMatchingPrefix
    ? MODEL_PRICING_USD_PER_MILLION[longestMatchingPrefix]
    : FALLBACK_RATES;
}

export function computeCostUsd(model: string, tokens: TokenUsage): number {
  const rates = resolveRates(model);
  const million = 1_000_000;
  const inputCost = (tokens.inputTokens / million) * rates.inputPerMillion;
  const outputCost = (tokens.outputTokens / million) * rates.outputPerMillion;
  const cacheCreationCost =
    (tokens.cacheCreationInputTokens / million) * rates.cacheCreationPerMillion;
  const cacheReadCost = (tokens.cacheReadInputTokens / million) * rates.cacheReadPerMillion;
  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}
