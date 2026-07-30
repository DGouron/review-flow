import type { EgressScanGateway } from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';
import type { EgressTraceGateway } from '@/modules/platform-integration/entities/egressScan/egressTrace.gateway.js';
import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
  NoteCommentThreadReplyInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';

export class EgressBlockedError extends Error {
  constructor(channel: string) {
    super(`Egress scan blocked output on channel ${channel}`);
    this.name = 'EgressBlockedError';
  }
}

export class EgressScannedNoteCommentPostGateway implements NoteCommentPostGateway {
  constructor(
    private readonly sink: NoteCommentPostGateway,
    private readonly scanner: EgressScanGateway,
    private readonly trace: EgressTraceGateway,
  ) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const result = this.scanner.scan({
      body: input.body,
      channel: 'postComment',
      projectPath: input.projectPath,
    });

    if (result.decision === 'block') {
      this.trace.record(result.trace);
      throw new EgressBlockedError(result.trace.channel);
    }

    if (result.decision === 'redact') {
      this.trace.record(result.trace);
      await this.sink.postComment({ ...input, body: result.body });
      return;
    }

    await this.sink.postComment({ ...input, body: result.body });
  }

  async postThreadReply(input: NoteCommentThreadReplyInput): Promise<void> {
    const result = this.scanner.scan({
      body: input.body,
      channel: 'THREAD_REPLY',
      projectPath: input.projectPath,
    });

    if (result.decision === 'block') {
      this.trace.record(result.trace);
      throw new EgressBlockedError(result.trace.channel);
    }

    if (result.decision === 'redact') {
      this.trace.record(result.trace);
    }

    await this.sink.postThreadReply({ ...input, body: result.body });
  }
}
