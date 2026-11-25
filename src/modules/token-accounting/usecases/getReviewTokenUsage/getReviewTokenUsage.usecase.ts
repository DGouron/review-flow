import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export type ReviewJobType = 'review' | 'followup';

export type GetReviewTokenUsageInput = {
  localPath: string;
  mrNumber: number;
  jobType: ReviewJobType;
  day: string;
};

export type ReviewTokenUsage = {
  sessions: TokenUsageRecord[];
  projectMedianCostUsd: number | null;
};

/** A report file is named by its local day, so a session belongs to it by the same local day. */
function localDayOf(isoInstant: string): string {
  const instant = new Date(isoInstant);
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${instant.getFullYear()}-${month}-${day}`;
}

const jobTypeOf = (record: TokenUsageRecord): ReviewJobType => record.jobType ?? 'review';

const reviewKeyOf = (record: TokenUsageRecord): string =>
  `${record.mrNumber}|${jobTypeOf(record)}|${localDayOf(record.recordedAt)}`;

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class GetReviewTokenUsageUseCase {
  constructor(private readonly gateway: TokenUsageGateway) {}

  async execute({
    localPath,
    mrNumber,
    jobType,
    day,
  }: GetReviewTokenUsageInput): Promise<ReviewTokenUsage> {
    const records = await this.gateway.loadAll(localPath);
    const reportKey = `${mrNumber}|${jobType}|${day}`;
    const sessions = records
      .filter((record) => reviewKeyOf(record) === reportKey)
      .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt));

    const costByReview = new Map<string, number>();
    for (const record of records) {
      const key = reviewKeyOf(record);
      costByReview.set(key, (costByReview.get(key) ?? 0) + record.usage.costUsd);
    }

    return { sessions, projectMedianCostUsd: medianOf([...costByReview.values()]) };
  }
}
