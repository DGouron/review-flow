import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

export class GitLabNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const encodedProject = input.projectPath.replace(/\//g, '%2F');
    // Single-quote for the shell: the executor runs this string through /bin/sh,
    // and a markdown body (backticks, $(), parens) must not be interpreted/injected.
    const quotedBody = `'${input.body.replace(/'/g, "'\\''")}'`;
    const command = `glab api --method POST projects/${encodedProject}/merge_requests/${input.mrNumber}/notes --field body=${quotedBody}`;
    this.executor(command);
  }
}
