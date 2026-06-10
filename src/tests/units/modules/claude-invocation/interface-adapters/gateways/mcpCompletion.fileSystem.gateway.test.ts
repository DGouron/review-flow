import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { SessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';
import { FileSystemMcpCompletionBridge } from '@/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.fileSystem.gateway.js';

describe('FileSystemMcpCompletionBridge (cross-process bridge for SPEC-169 B3)', () => {
  let directory: string;
  let timers: Map<number, () => void>;
  let nextTimerId: number;

  function fakeSetInterval(handler: () => void): ReturnType<typeof setInterval> {
    nextTimerId += 1;
    const id = nextTimerId;
    timers.set(id, handler);
    return id as unknown as ReturnType<typeof setInterval>;
  }

  function fakeClearInterval(timerId: ReturnType<typeof setInterval>): void {
    timers.delete(timerId as unknown as number);
  }

  function tick(): void {
    for (const handler of Array.from(timers.values())) {
      handler();
    }
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'completion-bridge-'));
    timers = new Map();
    nextTimerId = 0;
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function makeBridge() {
    return new FileSystemMcpCompletionBridge({
      directory,
      pollIntervalMs: 10,
      setIntervalImpl: fakeSetInterval,
      clearIntervalImpl: fakeClearInterval,
    });
  }

  it('publishes a completion event to the directory as an atomic JSON file', () => {
    const bridge = makeBridge();
    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };

    bridge.publish('job-1', completion);

    const files = readdirSync(directory).filter((name) => name.endsWith('.json'));
    expect(files).toEqual(['job-1.json']);
  });

  it('delivers a buffered event immediately on subscribe (file already on disk)', () => {
    const bridge = makeBridge();
    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };
    bridge.publish('job-2', completion);

    const received: SessionCompletion[] = [];
    bridge.subscribe('job-2', (value) => {
      received.push(value);
    });

    expect(received).toEqual([completion]);
  });

  it('delivers a completion when the publisher writes after the subscriber polls', () => {
    const bridge = makeBridge();
    const received: SessionCompletion[] = [];
    bridge.subscribe('job-3', (value) => {
      received.push(value);
    });

    expect(received).toEqual([]);

    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };
    bridge.publish('job-3', completion);
    tick();

    expect(received).toEqual([completion]);
  });

  it('cleans up the on-disk file once a listener consumes the event', () => {
    const bridge = makeBridge();
    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };

    bridge.subscribe('job-4', () => {});
    bridge.publish('job-4', completion);
    tick();

    expect(existsSync(join(directory, 'job-4.json'))).toBe(false);
  });

  it('reports a synthetic failure when the event file is malformed JSON', () => {
    const bridge = makeBridge();
    writeFileSync(join(directory, 'job-5.json'), '{not valid json');

    const received: SessionCompletion[] = [];
    bridge.subscribe('job-5', (value) => {
      received.push(value);
    });
    tick();

    expect(received).toHaveLength(1);
    expect(received[0]?.source).toBe('mcp');
    expect(received[0]?.outcome).toBe('failed');
    expect(received[0]?.reason).toBe('completion-bridge-malformed');
  });

  it('removes pending file on unsubscribe so a future subscribe does not pick a stale event', () => {
    const bridge = makeBridge();
    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };
    bridge.publish('job-6', completion);

    bridge.unsubscribe('job-6');

    expect(existsSync(join(directory, 'job-6.json'))).toBe(false);
  });

  it('replaces an existing subscription if subscribe is called twice for the same jobId', () => {
    const bridge = makeBridge();
    const received: SessionCompletion[] = [];

    bridge.subscribe('job-7', () => {
      received.push({ source: 'mcp', outcome: 'failed', reason: 'first-listener' });
    });
    bridge.subscribe('job-7', (value) => {
      received.push(value);
    });

    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };
    bridge.publish('job-7', completion);
    tick();

    expect(received).toEqual([completion]);
  });

  it('sanitises hostile job ids so subscribe cannot escape the directory', () => {
    const bridge = makeBridge();
    const completion: SessionCompletion = { source: 'mcp', outcome: 'completed', reason: null };

    bridge.publish('../escape', completion);

    const files = readdirSync(directory);
    expect(files).toEqual(['.._escape.json']);
  });
});
