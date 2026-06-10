import { describe, it, expect } from 'vitest';

import { StreamJsonParser } from '@/frameworks/claude/streamJsonParser.js';

// SPEC-169 (FR-8): the parser is now a no-op stub. These tests pin its
// contract — empty string, null usage, no exception on any input — so a
// future regression that reintroduces parsing inside the stub is caught.
describe('StreamJsonParser (SPEC-169 no-op stub)', () => {
  it('returns empty assistant text regardless of feed input', () => {
    const parser = new StreamJsonParser();
    parser.feed('{"type":"assistant","message":{"content":[{"type":"text","text":"ignored"}]}}\n');
    expect(parser.getAssistantText()).toBe('');
  });

  it('returns null usage regardless of feed input', () => {
    const parser = new StreamJsonParser();
    parser.feed(
      '{"type":"result","total_cost_usd":1,"usage":{"input_tokens":1,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n',
    );
    expect(parser.getUsage()).toBeNull();
  });

  it('does not throw on invalid input', () => {
    const parser = new StreamJsonParser();
    expect(() => {
      parser.feed('garbage \n {');
      parser.feed('');
      parser.feed('\0');
    }).not.toThrow();
  });
});
