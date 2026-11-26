import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ClaudeSessionGateway,
  DispatchResult,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type {
  ClaudeSessionJobType,
  SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  parseStreamJsonEvent,
  extractText,
  isTurnComplete,
} from '@/modules/claude-invocation/interface-adapters/gateways/transcriptStreamJson.parser.js';
import type {
  EmberAnswerStartOptions,
  EmberAnswerSubscriber,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';

export type EmberToolPolicy = {
  allowedTools: string;
  disallowedTools: string;
};

export type ClaudeSessionLabel = {
  jobType: ClaudeSessionJobType;
  jobIdPrefix: string;
};

export type DispatchedSessionSettings = {
  mcpConfigJson: string;
  toolPolicy: EmberToolPolicy;
  label: ClaudeSessionLabel;
};

export type EmberAnswerRunSettings = {
  homeDir: string;
  pollIntervalMs: number;
  session: DispatchedSessionSettings;
};

const MAX_TAIL_ATTEMPTS = 240;

export class EmberAnswerRunner {
  private cancelled = false;
  private timer: NodeJS.Timeout | null = null;
  private byteOffset = 0;
  private pendingLine = '';
  private transcriptPath: string | null = null;
  private projectDir: string | null = null;
  private shortSessionId: SessionId | null = null;
  private attempts = 0;
  private stopped = false;

  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly settings: EmberAnswerRunSettings,
    private readonly subscriber: EmberAnswerSubscriber,
  ) {}

  begin(options: EmberAnswerStartOptions): void {
    void this.dispatchThenTail(options);
  }

  cancel(): void {
    this.cancelled = true;
    this.stopTimer();
    this.stopSession();
  }

  private async dispatchThenTail(options: EmberAnswerStartOptions): Promise<void> {
    const dispatch = await this.dispatchSafely(options);

    if (dispatch.status !== 'dispatched') {
      this.fail('ember-answer-dispatch-failed');
      return;
    }

    this.shortSessionId = dispatch.sessionId;
    if (this.cancelled) {
      this.stopSession();
      return;
    }

    const slug = options.projectPath.replace(/\//g, '-');
    this.projectDir = join(this.settings.homeDir, '.claude', 'projects', slug);
    this.scheduleTail();
  }

  private async dispatchSafely(options: EmberAnswerStartOptions): Promise<DispatchResult> {
    const { session } = this.settings;
    try {
      return await this.sessionGateway.dispatch({
        prompt: options.question,
        flags: {
          model: 'sonnet',
          permissionMode: 'auto',
          systemPrompt: options.systemPrompt,
          mcpConfigJson: session.mcpConfigJson,
          allowedTools: session.toolPolicy.allowedTools,
          disallowedTools: session.toolPolicy.disallowedTools,
        },
        localPath: options.projectPath,
        jobId: `${session.label.jobIdPrefix}-${Date.now()}`,
        jobType: session.label.jobType,
      });
    } catch (error) {
      return {
        status: 'failed',
        rawStderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private scheduleTail(): void {
    if (this.cancelled) {
      return;
    }
    this.timer = setTimeout(() => {
      this.tailOnce();
    }, this.settings.pollIntervalMs);
  }

  private tailOnce(): void {
    if (this.cancelled) {
      return;
    }
    this.attempts += 1;

    this.resolveTranscript();
    const completed = this.readNewLines();
    if (completed) {
      this.finish();
      return;
    }

    if (this.attempts >= MAX_TAIL_ATTEMPTS) {
      this.fail('ember-answer-timeout');
      return;
    }

    this.scheduleTail();
  }

  private resolveTranscript(): void {
    if (this.transcriptPath !== null || this.projectDir === null || this.shortSessionId === null) {
      return;
    }
    if (!existsSync(this.projectDir)) {
      return;
    }
    const match = readdirSync(this.projectDir).find(
      (name) => name.startsWith(this.shortSessionId ?? '') && name.endsWith('.jsonl'),
    );
    if (match !== undefined) {
      this.transcriptPath = join(this.projectDir, match);
    }
  }

  private readNewLines(): boolean {
    if (this.transcriptPath === null || !existsSync(this.transcriptPath)) {
      return false;
    }

    let raw: string;
    try {
      raw = readFileSync(this.transcriptPath, 'utf-8');
    } catch {
      this.fail('ember-answer-transcript-unreadable');
      return false;
    }

    const fresh = raw.slice(this.byteOffset);
    this.byteOffset = raw.length;
    this.pendingLine += fresh;
    const lines = this.pendingLine.split('\n');
    this.pendingLine = lines.pop() ?? '';

    let terminal = false;
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const event = parseStreamJsonEvent(line);
      if (event === null) {
        continue;
      }
      const text = extractText(event);
      if (text !== null) {
        this.subscriber.onChunk(text);
      }
      if (isTurnComplete(event)) {
        terminal = true;
      }
    }
    return terminal;
  }

  private finish(): void {
    if (this.cancelled) {
      return;
    }
    this.readNewLines();
    this.stopTimer();
    this.stopSession();
    this.subscriber.onDone();
  }

  private fail(message: string): void {
    if (this.cancelled) {
      return;
    }
    this.cancel();
    this.subscriber.onError(message);
  }

  private stopSession(): void {
    if (this.stopped || this.shortSessionId === null) {
      return;
    }
    this.stopped = true;
    void this.stopSessionSafely(this.shortSessionId);
  }

  private async stopSessionSafely(sessionId: SessionId): Promise<void> {
    try {
      await this.sessionGateway.stop(sessionId);
    } catch {
      return;
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
