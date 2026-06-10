import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type {
  EmberAnswerStartOptions,
  EmberAnswerSubscriber,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';
import { EmberAnswerTransportClaudeGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';

interface CollectedSubscriber extends EmberAnswerSubscriber {
  chunks: string[];
  done: boolean;
  error: string | null;
}

function collectingSubscriber(resolve: () => void): CollectedSubscriber {
  const subscriber: CollectedSubscriber = {
    chunks: [],
    done: false,
    error: null,
    onChunk(text: string): void {
      subscriber.chunks.push(text);
    },
    onDone(): void {
      subscriber.done = true;
      resolve();
    },
    onError(message: string): void {
      subscriber.error = message;
      resolve();
    },
  };
  return subscriber;
}

function settled(): {
  subscriber: CollectedSubscriber;
  finished: Promise<void>;
} {
  let resolve: () => void = () => undefined;
  const finished = new Promise<void>((res) => {
    resolve = res;
  });
  const subscriber = collectingSubscriber(resolve);
  return { subscriber, finished };
}

function projectDirFor(projectPath: string, homeDir: string): string {
  const slug = projectPath.replace(/\//g, '-');
  const dir = join(homeDir, '.claude', 'projects', slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const FAST_OPTIONS = (homeDir: string) => ({
  homeDir,
  pollIntervalMs: 1,
});

describe('EmberAnswerTransportClaudeGateway (integration with real filesystem)', () => {
  let homeDir: string;
  let sessionGateway: StubClaudeSessionGateway;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ember-answer-'));
    sessionGateway = new StubClaudeSessionGateway();
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  function startOptions(): EmberAnswerStartOptions {
    return {
      question: 'what is the review velocity?',
      systemPrompt: 'You are Ember.',
      projectPath: homeDir,
    };
  }

  it('dispatches --bg with read-only flags and streams transcript chunks until turn-complete', async () => {
    const dir = projectDirFor(homeDir, homeDir);
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello ' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'world' }], stop_reason: 'end_turn' },
      }),
    ];
    writeFileSync(join(dir, 'stub-session-full-uuid.jsonl'), lines.join('\n') + '\n');

    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const { subscriber, finished } = settled();

    const result = gateway.start(startOptions(), subscriber);
    expect(result.status).toBe('started');

    await finished;

    expect(subscriber.chunks).toEqual(['Hello ', 'world']);
    expect(subscriber.done).toBe(true);
    expect(subscriber.error).toBeNull();

    const dispatch = sessionGateway.dispatchCalls[0];
    expect(dispatch.jobType).toBe('ember-chat');
    expect(dispatch.flags.allowedTools).toBe('Read,Glob,Grep');
    expect(dispatch.flags.disallowedTools).toBe('Edit,Write,Bash,Task');
    expect(dispatch.flags.mcpConfigJson).toBe('{"mcpServers":{}}');
    expect(dispatch.flags.permissionMode).toBe('auto');
    expect(sessionGateway.stopCalls).toEqual(['stub-session']);
  });

  it('reports ember-answer-dispatch-failed and never stops a session when dispatch fails', async () => {
    sessionGateway.setDispatchResult({ status: 'failed', rawStderr: 'not logged in' });

    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const { subscriber, finished } = settled();

    gateway.start(startOptions(), subscriber);
    await finished;

    expect(subscriber.error).toBe('ember-answer-dispatch-failed');
    expect(subscriber.done).toBe(false);
    expect(subscriber.chunks).toEqual([]);
    expect(sessionGateway.stopCalls).toEqual([]);
  });

  it('completes on a system turn_duration marker even without assistant stop_reason', async () => {
    const dir = projectDirFor(homeDir, homeDir);
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'partial answer' }] },
      }),
      JSON.stringify({ type: 'system', subtype: 'turn_duration' }),
    ];
    writeFileSync(join(dir, 'stub-session-x.jsonl'), lines.join('\n') + '\n');

    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const { subscriber, finished } = settled();

    gateway.start(startOptions(), subscriber);
    await finished;

    expect(subscriber.chunks).toEqual(['partial answer']);
    expect(subscriber.done).toBe(true);
    expect(sessionGateway.stopCalls).toEqual(['stub-session']);
  });

  it('skips blank and unparseable transcript lines while still finishing the turn', async () => {
    const dir = projectDirFor(homeDir, homeDir);
    const lines = [
      '',
      '   ',
      'not-json-at-all',
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'real' }] } }),
      JSON.stringify({ type: 'result' }),
    ];
    writeFileSync(join(dir, 'stub-session-noise.jsonl'), lines.join('\n') + '\n');

    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const { subscriber, finished } = settled();

    gateway.start(startOptions(), subscriber);
    await finished;

    expect(subscriber.chunks).toEqual(['real']);
    expect(subscriber.done).toBe(true);
  });

  it('times out and stops the session when no transcript ever turn-completes', async () => {
    const dir = projectDirFor(homeDir, homeDir);
    writeFileSync(
      join(dir, 'stub-session-stuck.jsonl'),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'thinking' }] },
      }) + '\n',
    );

    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, {
      homeDir,
      pollIntervalMs: 1,
    });
    const { subscriber, finished } = settled();

    gateway.start(startOptions(), subscriber);
    await finished;

    expect(subscriber.error).toBe('ember-answer-timeout');
    expect(subscriber.done).toBe(false);
    expect(sessionGateway.stopCalls).toEqual(['stub-session']);
  });

  it('does not emit done or error after the run is cancelled', async () => {
    const gateway = new EmberAnswerTransportClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const subscriber: CollectedSubscriber = {
      chunks: [],
      done: false,
      error: null,
      onChunk(text) {
        subscriber.chunks.push(text);
      },
      onDone() {
        subscriber.done = true;
      },
      onError(message) {
        subscriber.error = message;
      },
    };

    const result = gateway.start(startOptions(), subscriber);
    expect(result.status).toBe('started');
    if (result.status === 'started') {
      result.run.cancel();
    }

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(subscriber.done).toBe(false);
    expect(subscriber.error).toBeNull();
  });
});
