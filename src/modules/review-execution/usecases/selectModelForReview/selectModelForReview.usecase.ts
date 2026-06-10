import type {
  ClaudeModelName,
  RoutingPolicy,
} from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';

type DiffStatsInput = { additions: number; deletions: number };

type Input = {
  diffStats: DiffStatsInput;
  policy: RoutingPolicy | null;
  defaultModel: ClaudeModelName;
};

export class SelectModelForReviewUseCase {
  execute({ diffStats, policy, defaultModel }: Input): ClaudeModelName {
    if (policy === null) {
      return defaultModel;
    }

    const totalLines = diffStats.additions + diffStats.deletions;

    if (totalLines <= policy.haikuMaxLines) {
      return 'haiku';
    }

    if (totalLines <= policy.sonnetMaxLines) {
      return 'sonnet';
    }

    return 'opus';
  }
}
