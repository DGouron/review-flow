import { PassThrough } from 'node:stream';

import { describe, it, expect } from 'vitest';

import { NodeStdinLineReader } from '@/modules/setup-wizard/interface-adapters/gateways/lineReader.stdin.gateway.js';

describe('NodeStdinLineReader', () => {
  it('parks read() until a line arrives, then resolves it', async () => {
    const input = new PassThrough();
    const reader = new NodeStdinLineReader(input);

    const pending = reader.read();
    input.write('hello\n');

    expect(await pending).toBe('hello');
  });

  it('buffers a line that arrives before read() and returns it on the next read()', async () => {
    const input = new PassThrough();
    const reader = new NodeStdinLineReader(input);

    input.write('queued\n');

    expect(await reader.read()).toBe('queued');
  });

  it('returns buffered lines in FIFO order', async () => {
    const input = new PassThrough();
    const reader = new NodeStdinLineReader(input);

    input.write('first\nsecond\n');

    expect(await reader.read()).toBe('first');
    expect(await reader.read()).toBe('second');
  });

  it('returns null to a reader waiting when the stream closes', async () => {
    const input = new PassThrough();
    const reader = new NodeStdinLineReader(input);

    const pending = reader.read();
    input.end();

    expect(await pending).toBeNull();
  });

  it('returns null on read() once the stream is already closed', async () => {
    const input = new PassThrough();
    const reader = new NodeStdinLineReader(input);
    input.end();
    await new Promise((resolve) => input.on('close', resolve));

    expect(await reader.read()).toBeNull();
  });
});
