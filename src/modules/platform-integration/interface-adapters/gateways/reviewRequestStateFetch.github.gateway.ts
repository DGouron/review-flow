import { z } from 'zod';

import type { ReviewRequestStateFetchGateway } from '@/modules/platform-integration/entities/reviewRequestState/reviewRequestStateFetch.gateway.js';
import type { ReviewRequestState } from '@/modules/review-execution/entities/reviewRequest/reviewRequest.entity.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const OPEN_PULL_REQUEST_LIMIT = 1000;

const openPullRequestsGuard = createGuard(
  z.array(z.object({ number: z.number().int().positive() })),
  'githubOpenPullRequests',
);

const pullRequestStateGuard = createGuard(
  z.object({ state: z.enum(['OPEN', 'CLOSED', 'MERGED']) }),
  'githubPullRequestState',
);

const STATE_BY_GITHUB_STATE: Record<'OPEN' | 'CLOSED' | 'MERGED', ReviewRequestState> = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
};

export class GitHubReviewRequestStateFetchGateway implements ReviewRequestStateFetchGateway {
  constructor(private readonly executor: ArgvCommandExecutor) {}

  listOpenNumbers(project: string): number[] {
    const output = this.executor('gh', [
      'pr',
      'list',
      '--repo',
      project,
      '--state',
      'open',
      '--json',
      'number',
      '--limit',
      String(OPEN_PULL_REQUEST_LIMIT),
    ]);
    return openPullRequestsGuard.parse(JSON.parse(output)).map((pullRequest) => pullRequest.number);
  }

  fetchState(project: string, reviewRequestNumber: number): ReviewRequestState {
    const output = this.executor('gh', [
      'pr',
      'view',
      String(reviewRequestNumber),
      '--repo',
      project,
      '--json',
      'state',
    ]);
    return STATE_BY_GITHUB_STATE[pullRequestStateGuard.parse(JSON.parse(output)).state];
  }
}
