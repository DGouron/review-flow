import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
  NoteCommentThreadReplyInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';

export class StubNoteCommentPostGateway implements NoteCommentPostGateway {
  readonly calls: NoteCommentPostInput[] = [];
  readonly threadReplies: NoteCommentThreadReplyInput[] = [];

  async postComment(input: NoteCommentPostInput): Promise<void> {
    this.calls.push(input);
  }

  async postThreadReply(input: NoteCommentThreadReplyInput): Promise<void> {
    this.threadReplies.push(input);
  }
}
