import { describe, it, expect } from 'vitest';
import {
  parseStreamJsonEvent,
  extractText,
  isTurnComplete,
} from '@/modules/claude-invocation/interface-adapters/gateways/transcriptStreamJson.parser.js';

describe('parseStreamJsonEvent', () => {
  it('parses a JSON object line into an event', () => {
    expect(parseStreamJsonEvent('{"type":"result"}')).toEqual({ type: 'result' });
  });

  it('returns null for a non-object JSON value', () => {
    expect(parseStreamJsonEvent('42')).toBeNull();
    expect(parseStreamJsonEvent('null')).toBeNull();
  });

  it('returns null for an invalid JSON line', () => {
    expect(parseStreamJsonEvent('{not json')).toBeNull();
    expect(parseStreamJsonEvent('')).toBeNull();
  });
});

describe('extractText', () => {
  it('reads a top-level text field', () => {
    expect(extractText({ text: 'hello' })).toBe('hello');
  });

  it('reads a streamed delta text', () => {
    expect(extractText({ delta: { text: 'world' } })).toBe('world');
  });

  it('joins text parts from a message content array', () => {
    expect(
      extractText({
        message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      }),
    ).toBe('ab');
  });

  it('ignores non-text content parts', () => {
    expect(
      extractText({
        message: { content: [{ type: 'tool_use' }, { type: 'text', text: 'kept' }] },
      }),
    ).toBe('kept');
  });

  it('returns null when content holds no text', () => {
    expect(extractText({ message: { content: [{ type: 'tool_use' }] } })).toBeNull();
  });

  it('returns null when message content is a plain string (user line, not an array)', () => {
    expect(extractText({ type: 'user', message: { content: 'Quelle est ma question ?' } })).toBeNull();
  });

  it('returns null when no text is present', () => {
    expect(extractText({ type: 'result' })).toBeNull();
  });
});

describe('isTurnComplete', () => {
  it('is true on a result event', () => {
    expect(isTurnComplete({ type: 'result' })).toBe(true);
  });

  it('is true on a message_stop event', () => {
    expect(isTurnComplete({ type: 'message_stop' })).toBe(true);
  });

  it('is true on a background-session turn_duration system line', () => {
    expect(isTurnComplete({ type: 'system', subtype: 'turn_duration' })).toBe(true);
  });

  it('is true on an assistant message that ended the turn with text', () => {
    expect(
      isTurnComplete({
        type: 'assistant',
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] },
      }),
    ).toBe(true);
  });

  it('is false on a thinking-only assistant message that ended the turn (no answer text yet)', () => {
    expect(
      isTurnComplete({
        type: 'assistant',
        message: { stop_reason: 'end_turn', content: [{ type: 'thinking' }] },
      }),
    ).toBe(false);
  });

  it('is false on a streaming assistant message with no stop reason', () => {
    expect(
      isTurnComplete({ type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } }),
    ).toBe(false);
  });

  it('is false on any other event', () => {
    expect(isTurnComplete({ type: 'message_delta' })).toBe(false);
    expect(isTurnComplete({ type: 'system', subtype: 'init' })).toBe(false);
    expect(isTurnComplete({})).toBe(false);
  });
});
