import { z } from 'zod';

import type {
  ReviewRequestOverview,
  ReviewRequestOverviewFetchGateway,
} from '@/modules/review-brief/entities/reviewBrief/reviewRequestOverview.gateway.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';

const gitHubPullRequestSchema = z.object({
  title: z.string(),
  body: z.string().nullish(),
  head: z.object({ sha: z.string().min(1) }),
});

export class GitHubReviewRequestOverviewFetchGateway implements ReviewRequestOverviewFetchGateway {
  constructor(private readonly executor: ArgvCommandExecutor) {}

  fetchOverview(projectPath: string, mergeRequestNumber: number): ReviewRequestOverview | null {
    try {
      const response = this.executor('gh', [
        'api',
        `repos/${projectPath}/pulls/${mergeRequestNumber}`,
      ]);
      const result = gitHubPullRequestSchema.safeParse(JSON.parse(response));
      if (!result.success) {
        return null;
      }
      return {
        title: result.data.title,
        description: result.data.body ?? '',
        headSha: result.data.head.sha,
      };
    } catch {
      return null;
    }
  }
}
