import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
  NoteCommentThreadReplyInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

// Single-quote for the shell: the executor runs this string through /bin/sh,
// and a markdown body (backticks, $(), parens) must not be interpreted/injected.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class GitLabNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const encodedProject = input.projectPath.replace(/\//g, '%2F');
    const command = `glab api --method POST projects/${encodedProject}/merge_requests/${input.mrNumber}/notes --field body=${shellQuote(input.body)}`;
    this.executor(command);
  }

  async postThreadReply(input: NoteCommentThreadReplyInput): Promise<void> {
    const encodedProject = input.projectPath.replace(/\//g, '%2F');
    const command = `glab api --method POST projects/${encodedProject}/merge_requests/${input.mrNumber}/discussions/${input.threadId}/notes --field body=${shellQuote(input.body)}`;
    this.executor(command);
  }
}
