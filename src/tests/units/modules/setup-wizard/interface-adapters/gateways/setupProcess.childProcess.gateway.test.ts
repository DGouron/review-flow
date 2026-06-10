import { describe, it, expect } from 'vitest';

import { splitLines } from '@/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.js';

describe('splitLines (subprocess stdout line buffering)', () => {
  it('extracts a single complete line and leaves no remainder', () => {
    const result = splitLines('', '{"step":"dependencies"}\n');

    expect(result.lines).toEqual(['{"step":"dependencies"}']);
    expect(result.rest).toBe('');
  });

  it('retains a partial line as remainder when no newline arrived yet', () => {
    const result = splitLines('', '{"step":"depend');

    expect(result.lines).toEqual([]);
    expect(result.rest).toBe('{"step":"depend');
  });

  it('reassembles a line split across two chunks via the carried buffer', () => {
    const first = splitLines('', '{"step":"depend');
    const second = splitLines(first.rest, 'encies","status":"in_progress"}\n');

    expect(second.lines).toEqual(['{"step":"dependencies","status":"in_progress"}']);
    expect(second.rest).toBe('');
  });

  it('splits several complete lines contained in one chunk', () => {
    const result = splitLines('', 'a\nb\nc\n');

    expect(result.lines).toEqual(['a', 'b', 'c']);
    expect(result.rest).toBe('');
  });

  it('keeps the trailing partial line as remainder after complete ones', () => {
    const result = splitLines('', 'a\nb\nc');

    expect(result.lines).toEqual(['a', 'b']);
    expect(result.rest).toBe('c');
  });

  it('drops empty and whitespace-only lines', () => {
    const result = splitLines('', 'a\n\n   \nb\n');

    expect(result.lines).toEqual(['a', 'b']);
    expect(result.rest).toBe('');
  });

  it('trims surrounding whitespace from extracted lines', () => {
    const result = splitLines('', '   {"step":"daemon"}   \n');

    expect(result.lines).toEqual(['{"step":"daemon"}']);
    expect(result.rest).toBe('');
  });
});
