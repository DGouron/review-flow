import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

export class GitHubNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    // Single-quote for the shell: the executor runs this string through /bin/sh,
    // and a markdown body (backticks, $(), parens) must not be interpreted/injected.
    const quotedBody = `'${input.body.replace(/'/g, "'\\''")}'`;
    const command = `gh api --method POST repos/${input.projectPath}/issues/${input.mrNumber}/comments --field body=${quotedBody}`;
    this.executor(command);
  }
}
