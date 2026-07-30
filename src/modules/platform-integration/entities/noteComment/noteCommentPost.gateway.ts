export interface NoteCommentPostInput {
  projectPath: string;
  mrNumber: number;
  body: string;
}

export interface NoteCommentThreadReplyInput extends NoteCommentPostInput {
  threadId: string;
}

export interface NoteCommentPostGateway {
  postComment(input: NoteCommentPostInput): Promise<void>;
  postThreadReply(input: NoteCommentThreadReplyInput): Promise<void>;
}
