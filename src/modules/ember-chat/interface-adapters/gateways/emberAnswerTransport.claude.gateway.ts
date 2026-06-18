import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  parseStreamJsonEvent,
  extractText,
  isTurnComplete,
} from '@/modules/claude-invocation/interface-adapters/gateways/transcriptStreamJson.parser.js';
import type {
  EmberAnswerStartOptions,
  EmberAnswerStartResult,
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';

/**
 * HUMBLE GLUE — NOT unit-tested. This is the single unverified mechanism in
 * SPEC-190 (plan §OPEN RISKS 1-2). Every layer above it (askEmber usecase,
 * relay, presenter, routes, client) is unit-tested against
 * StubEmberAnswerTransportGateway; this file is the swappable real
 * implementation, validated by acceptance/manual only.
 *
 * Transport: ONE `claude --bg` dispatch per question (subscription / OAuth
 * billing, the same path reviews use — NEVER `--print`/headless, which switches
 * to API billing on 2026-06-15). After dispatch, tail the session transcript
 * JSONL, emitting onChunk per new assistant text segment and onDone on the
 * turn-complete marker, then stop the (persistent) background session.
 *
 * Read-only over PROJECT state is enforced structurally: read-only tools
 * (Read,Glob,Grep) plus the single MCP tool `record_insight` (writes only to
 * Ember's private per-project memory, never to reviews/threads/files/config —
 * SPEC-193), with Edit/Write/Bash/Task in disallowedTools. `--permission-mode
 * auto` matches the proven reviews path (`plan` would risk the agent emitting a
 * plan instead of an answer). The MCP config is resolved lazily per question
 * (buildMcpConfig provider) so server boot never depends on a built dist.
 *
 * Verified against claude 2.1.154 (`claude --bg --permission-mode auto`):
 *  - The transcript file is named with the FULL session UUID, while `backgrounded
 *    · <id>` only yields the short prefix — so the file is resolved by prefix glob
 *    (<shortId>*.jsonl) in the project dir, NOT by exact name.
 *  - There is NO `result`/`message_stop` line. Turn completion is signalled by an
 *    `assistant` message with stop_reason `end_turn` and a `system` line with
 *    subtype `turn_duration` (both handled by isTurnComplete).
 *  - A `--bg` session is persistent: after answering it goes `idle` (not a
 *    terminal status), so a listAgents() poll cannot detect "done" — completion
 *    relies on the transcript marker; the session is then stopped here.
 *  - Assistant text is carried under message.content[].text (what extractText
 *    reads); chunks are whole-message granularity (coarse progressive), not deltas.
 *
 * STILL TO VERIFY MANUALLY: drive the chat end-to-end in a browser.
 */

export interface EmberAnswerTransportClaudeGatewayOptions {
  homeDir: string;
  pollIntervalMs?: number;
  buildMcpConfig: () => string;
}

const DEFAULT_POLL_INTERVAL_MS = 750;

const EMBER_ALLOWED_TOOLS = 'Read,Glob,Grep,mcp__review-progress__record_insight';

export class EmberAnswerTransportClaudeGateway implements EmberAnswerTransportGateway {
  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly options: EmberAnswerTransportClaudeGatewayOptions,
  ) {}

  start(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): EmberAnswerStartResult {
    const run = new EmberAnswerRunner(
      this.sessionGateway,
      this.options.homeDir,
      this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      this.options.buildMcpConfig(),
      options,
      subscriber,
    );
    run.begin();
    return { status: 'started', run };
  }
}

const MAX_TAIL_ATTEMPTS = 240;

class EmberAnswerRunner {
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
    private readonly homeDir: string,
    private readonly pollIntervalMs: number,
    private readonly mcpConfigJson: string,
    private readonly options: EmberAnswerStartOptions,
    private readonly subscriber: EmberAnswerSubscriber,
  ) {}

  begin(): void {
    void this.dispatchThenTail();
  }

  cancel(): void {
    this.cancelled = true;
    this.stopTimer();
    this.stopSession();
  }

  private async dispatchThenTail(): Promise<void> {
    const dispatch = await this.sessionGateway.dispatch({
      prompt: this.options.question,
      flags: {
        model: 'sonnet',
        permissionMode: 'auto',
        systemPrompt: this.options.systemPrompt,
        mcpConfigJson: this.mcpConfigJson,
        allowedTools: EMBER_ALLOWED_TOOLS,
        disallowedTools: 'Edit,Write,Bash,Task',
      },
      localPath: this.options.projectPath,
      jobId: `ember-${Date.now()}`,
      jobType: 'ember-chat',
    });

    if (dispatch.status !== 'dispatched') {
      this.fail('ember-answer-dispatch-failed');
      return;
    }

    const slug = this.options.projectPath.replace(/\//g, '-');
    this.projectDir = join(this.homeDir, '.claude', 'projects', slug);
    this.shortSessionId = dispatch.sessionId;
    this.scheduleTail();
  }

  private scheduleTail(): void {
    if (this.cancelled) {
      return;
    }
    this.timer = setTimeout(() => {
      this.tailOnce();
    }, this.pollIntervalMs);
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
    void this.sessionGateway.stop(this.shortSessionId);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
