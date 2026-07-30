import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
  NoteCommentThreadReplyInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

// Single-quote for the shell: the executor runs this string through /bin/sh,
// and a markdown body (backticks, $(), parens) must not be interpreted/injected.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const ADD_THREAD_REPLY_MUTATION =
  'mutation($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) { comment { id } } }';

export class GitHubNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const command = `gh api --method POST repos/${input.projectPath}/issues/${input.mrNumber}/comments --field body=${shellQuote(input.body)}`;
    this.executor(command);
  }

  /**
   * Replies inside the review thread itself. The thread is addressed by its GraphQL
   * node id (`PRRT_…`), which the REST comment endpoints cannot target — hence the
   * mutation rather than a `--field in_reply_to`.
   */
  async postThreadReply(input: NoteCommentThreadReplyInput): Promise<void> {
    const command = `gh api graphql -f query=${shellQuote(ADD_THREAD_REPLY_MUTATION)} -f threadId=${shellQuote(input.threadId)} -f body=${shellQuote(input.body)}`;
    this.executor(command);
  }
}
