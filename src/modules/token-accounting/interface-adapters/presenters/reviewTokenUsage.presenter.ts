import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';
import type { ReviewTokenUsage } from '@/modules/token-accounting/usecases/getReviewTokenUsage/getReviewTokenUsage.usecase.js';
import type { Presenter } from '@/shared/foundation/presenter.base.js';

export interface ReviewTokenUsageTotals {
  durationMinutes: number | null;
  turns: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: string;
}

export interface ReviewTokenUsageRow extends ReviewTokenUsageTotals {
  sessionId: string | null;
  model: string;
  recordedAt: string;
}

export interface ReviewTokenUsageViewModel {
  isEmpty: boolean;
  sessions: ReviewTokenUsageRow[];
  total: ReviewTokenUsageTotals;
  cacheReadSharePercent: number | null;
  costVsProjectMedian: number | null;
}

const formatUsd = (amount: number): string => `$${amount.toFixed(2)}`;

const minutesOf = (durationMs: number | undefined): number | null =>
  durationMs === undefined ? null : Math.round(durationMs / 60_000);

const sumOf = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);

const isKnown = (value: number | null): value is number => value !== null;

function sumOrNull(values: Array<number | null>): number | null {
  const known = values.filter(isKnown);
  return known.length === values.length ? sumOf(known) : null;
}

function rowOf(session: TokenUsageRecord): ReviewTokenUsageRow {
  return {
    sessionId: session.sessionId ?? null,
    model: session.model,
    recordedAt: session.recordedAt,
    durationMinutes: minutesOf(session.durationMs),
    turns: session.turns ?? null,
    inputTokens: session.usage.inputTokens,
    outputTokens: session.usage.outputTokens,
    cacheReadTokens: session.usage.cacheReadInputTokens,
    cacheWriteTokens: session.usage.cacheCreationInputTokens,
    costUsd: formatUsd(session.usage.costUsd),
  };
}

export class ReviewTokenUsagePresenter implements Presenter<
  ReviewTokenUsage,
  ReviewTokenUsageViewModel
> {
  present({ sessions, projectMedianCostUsd }: ReviewTokenUsage): ReviewTokenUsageViewModel {
    const rows = sessions.map(rowOf);
    const totalCostUsd = sumOf(sessions.map((session) => session.usage.costUsd));
    const total: ReviewTokenUsageTotals = {
      durationMinutes: sumOrNull(rows.map((row) => row.durationMinutes)),
      turns: sumOrNull(rows.map((row) => row.turns)),
      inputTokens: sumOf(rows.map((row) => row.inputTokens)),
      outputTokens: sumOf(rows.map((row) => row.outputTokens)),
      cacheReadTokens: sumOf(rows.map((row) => row.cacheReadTokens)),
      cacheWriteTokens: sumOf(rows.map((row) => row.cacheWriteTokens)),
      costUsd: formatUsd(totalCostUsd),
    };
    const allTokens =
      total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens;

    return {
      isEmpty: rows.length === 0,
      sessions: rows,
      total,
      cacheReadSharePercent:
        allTokens > 0 ? Math.round((total.cacheReadTokens / allTokens) * 100) : null,
      costVsProjectMedian:
        rows.length > 0 && projectMedianCostUsd !== null && projectMedianCostUsd > 0
          ? Math.round((totalCostUsd / projectMedianCostUsd) * 10) / 10
          : null,
    };
  }
}
