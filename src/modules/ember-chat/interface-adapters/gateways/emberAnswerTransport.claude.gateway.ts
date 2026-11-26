import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type {
  EmberAnswerStartOptions,
  EmberAnswerStartResult,
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';
import {
  EmberAnswerRunner,
  type EmberAnswerRunSettings,
  type EmberToolPolicy,
} from '@/modules/ember-chat/interface-adapters/gateways/emberAnswerRunner.claude.js';

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

export type EmberAnswerSessionConfiguration = {
  buildMcpConfig: () => string;
  toolPolicy?: EmberToolPolicy;
};

export interface EmberAnswerTransportClaudeGatewayOptions {
  homeDir: string;
  pollIntervalMs?: number;
  session: EmberAnswerSessionConfiguration;
}

const DEFAULT_POLL_INTERVAL_MS = 750;

const EMBER_TOOL_POLICY: EmberToolPolicy = {
  allowedTools: 'Read,Glob,Grep,mcp__review-progress__record_insight',
  disallowedTools: 'Edit,Write,Bash,Task',
};

export class EmberAnswerTransportClaudeGateway implements EmberAnswerTransportGateway {
  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly options: EmberAnswerTransportClaudeGatewayOptions,
  ) {}

  start(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): EmberAnswerStartResult {
    const run = new EmberAnswerRunner(this.sessionGateway, this.resolveRunSettings(), subscriber);
    run.begin(options);
    return { status: 'started', run };
  }

  private resolveRunSettings(): EmberAnswerRunSettings {
    const { session } = this.options;
    return {
      homeDir: this.options.homeDir,
      pollIntervalMs: this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      session: {
        mcpConfigJson: session.buildMcpConfig(),
        toolPolicy: session.toolPolicy ?? EMBER_TOOL_POLICY,
      },
    };
  }
}
