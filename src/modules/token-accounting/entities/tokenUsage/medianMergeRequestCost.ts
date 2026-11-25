import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

const mergeRequestKeyOf = (record: TokenUsageRecord): string =>
  `${record.projectPath}|${record.mrNumber}`;

/** The median cost of a merge request, each one summing every session that worked on it. */
export function medianMergeRequestCostUsd(records: TokenUsageRecord[]): number | null {
  const costByMergeRequest = new Map<string, number>();
  for (const record of records) {
    const key = mergeRequestKeyOf(record);
    costByMergeRequest.set(key, (costByMergeRequest.get(key) ?? 0) + record.usage.costUsd);
  }
  const costs = [...costByMergeRequest.values()].toSorted((a, b) => a - b);
  if (costs.length === 0) return null;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 === 1 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}
