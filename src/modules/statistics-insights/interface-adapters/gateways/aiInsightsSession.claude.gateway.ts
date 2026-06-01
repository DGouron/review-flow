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
  AiInsightsSessionGateway,
  AiInsightsSessionResult,
} from '@/modules/statistics-insights/entities/insight/aiInsightsSession.gateway.js';

/**
 * HUMBLE GLUE — NOT unit-tested. The generateAiInsightsViaSession use case is
 * unit-tested against StubAiInsightsSessionGateway; this file is the swappable
 * real implementation, validated by acceptance/manual only.
 *
 * Transport: ONE `claude --bg` dispatch per insights run (subscription / OAuth
 * billing, the same path reviews and Ember use — NEVER `--print`/headless, which
 * switches to API billing on 2026-06-15). After dispatch, tail the session
 * transcript JSONL, accumulate every assistant text segment, and on the
 * turn-complete marker return the full answer, then stop/remove the session.
 *
 * The insights prompt is self-contained (stats + review excerpts are embedded),
 * so the session needs no MCP servers and only read-only tools.
 */

export interface AiInsightsSessionClaudeGatewayOptions {
  homeDir: string;
  model: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 300;

export class AiInsightsSessionClaudeGateway implements AiInsightsSessionGateway {
  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly options: AiInsightsSessionClaudeGatewayOptions,
  ) {}

  async run(prompt: string, projectPath: string): Promise<AiInsightsSessionResult> {
    const dispatch = await this.sessionGateway.dispatch({
      prompt,
      flags: {
        model: this.options.model,
        permissionMode: 'auto',
        systemPrompt: '',
        mcpConfigJson: '{"mcpServers":{}}',
        allowedTools: 'Read,Glob,Grep',
        disallowedTools: 'Edit,Write,Bash,Task',
      },
      localPath: projectPath,
      jobId: `insights-${Date.now()}`,
      jobType: 'insights',
    });

    if (dispatch.status !== 'dispatched') {
      return { status: 'unavailable', reason: dispatch.status };
    }

    const sessionId = dispatch.sessionId;
    const slug = projectPath.replace(/\//g, '-');
    const projectDir = join(this.options.homeDir, '.claude', 'projects', slug);

    try {
      const answer = await this.readAnswer(projectDir, sessionId);
      return answer === null
        ? { status: 'timed-out' }
        : { status: 'completed', answer };
    } finally {
      await this.cleanup(sessionId);
    }
  }

  private async readAnswer(projectDir: string, sessionId: SessionId): Promise<string | null> {
    const pollInterval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    let transcriptPath: string | null = null;
    let byteOffset = 0;
    let pendingLine = '';
    const chunks: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await delay(pollInterval);

      if (transcriptPath === null) {
        transcriptPath = resolveTranscript(projectDir, sessionId);
      }
      if (transcriptPath === null || !existsSync(transcriptPath)) {
        continue;
      }

      let raw: string;
      try {
        raw = readFileSync(transcriptPath, 'utf-8');
      } catch {
        continue;
      }
      const fresh = raw.slice(byteOffset);
      byteOffset = raw.length;
      pendingLine += fresh;
      const lines = pendingLine.split('\n');
      pendingLine = lines.pop() ?? '';

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
          chunks.push(text);
        }
        if (isTurnComplete(event)) {
          return chunks.join('');
        }
      }
    }

    return null;
  }

  private async cleanup(sessionId: SessionId): Promise<void> {
    await this.sessionGateway.stop(sessionId);
    await this.sessionGateway.remove(sessionId);
  }
}

function resolveTranscript(projectDir: string, sessionId: SessionId): string | null {
  if (!existsSync(projectDir)) {
    return null;
  }
  const match = readdirSync(projectDir).find(
    (name) => name.startsWith(sessionId) && name.endsWith('.jsonl'),
  );
  return match === undefined ? null : join(projectDir, match);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
