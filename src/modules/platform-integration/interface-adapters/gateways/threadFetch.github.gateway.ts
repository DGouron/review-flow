import { execSync, execFileSync } from 'node:child_process';

import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type {
  ReviewContextThread,
  ReviewContextThreadComment,
} from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type { ArgvCommandExecutor } from '@/shared/foundation/commandExecutor.js';

export type CommandExecutor = (command: string) => string;

export const defaultGitHubExecutor: CommandExecutor = (command: string) => {
  return execSync(command, { encoding: 'utf-8', timeout: 30000 });
};

export const defaultGitHubArgvExecutor: ArgvCommandExecutor = (command: string, args: string[]) => {
  return execFileSync(command, args, { encoding: 'utf-8', timeout: 30000 });
};

const COMMENTS_PER_THREAD = 50;

const REVIEW_THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: ${COMMENTS_PER_THREAD}) {
            nodes { author { login } body createdAt }
          }
        }
      }
    }
  }
}`;

interface GitHubCommentNode {
  author: { login: string } | null;
  body: string;
  createdAt: string;
}

interface GitHubReviewThreadNode {
  id: string;
  isResolved: boolean;
  path: string | null;
  line: number | null;
  comments: {
    nodes: GitHubCommentNode[];
  };
}

interface GitHubGraphQLResponse {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: GitHubReviewThreadNode[];
        };
      };
    };
  };
}

function toComment(node: GitHubCommentNode): ReviewContextThreadComment {
  return {
    author: node.author?.login ?? null,
    body: node.body,
    createdAt: node.createdAt,
  };
}

export class GitHubThreadFetchGateway implements ThreadFetchGateway {
  constructor(private readonly executor: ArgvCommandExecutor) {}

  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[] {
    const [owner, name] = projectPath.split('/');

    const response = this.executor('gh', [
      'api',
      'graphql',
      '-f',
      `query=${REVIEW_THREADS_QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${mergeRequestNumber}`,
    ]);

    const data: GitHubGraphQLResponse = JSON.parse(response);
    const nodes = data.data.repository.pullRequest.reviewThreads.nodes;

    return nodes.map((node) => ({
      id: node.id,
      file: node.path,
      line: node.line,
      status: node.isResolved ? ('resolved' as const) : ('open' as const),
      body: node.comments.nodes[0]?.body ?? '',
      comments: node.comments.nodes.map(toComment),
    }));
  }
}
