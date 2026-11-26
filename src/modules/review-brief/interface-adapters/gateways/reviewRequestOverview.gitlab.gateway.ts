import { z } from 'zod';

import type {
  ReviewRequestOverview,
  ReviewRequestOverviewFetchGateway,
} from '@/modules/review-brief/entities/reviewBrief/reviewRequestOverview.gateway.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';

const gitLabMergeRequestSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  sha: z.string().min(1),
});

export class GitLabReviewRequestOverviewFetchGateway implements ReviewRequestOverviewFetchGateway {
  constructor(private readonly executor: ArgvCommandExecutor) {}

  fetchOverview(projectPath: string, mergeRequestNumber: number): ReviewRequestOverview | null {
    try {
      const encodedProject = encodeURIComponent(projectPath);
      const response = this.executor('glab', [
        'api',
        `projects/${encodedProject}/merge_requests/${mergeRequestNumber}`,
      ]);
      const result = gitLabMergeRequestSchema.safeParse(JSON.parse(response));
      if (!result.success) {
        return null;
      }
      return {
        title: result.data.title,
        description: result.data.description ?? '',
        headSha: result.data.sha,
      };
    } catch {
      return null;
    }
  }
}
