import { describe, it, expect } from 'vitest';

import {
  parseEmberEvent,
  foldAnswer,
  avatarStateFromEvent,
  shouldShowRetry,
  shouldSendQuestion,
} from '@/dashboard/modules/emberChat.js';

describe('parseEmberEvent', () => {
  it('parses a chunk event', () => {
    const event = parseEmberEvent('{"type":"chunk","text":"bonjour"}');

    expect(event).not.toBeNull();
    expect(event?.type).toBe('chunk');
  });

  it('returns null for a malformed payload', () => {
    expect(parseEmberEvent('not json')).toBeNull();
  });

  it('returns null for an event without a type', () => {
    expect(parseEmberEvent('{"text":"x"}')).toBeNull();
  });
});

describe('foldAnswer', () => {
  it('appends chunk text progressively to the accumulated answer', () => {
    const first = foldAnswer('', { type: 'chunk', text: 'Le pire ' });
    const second = foldAnswer(first, { type: 'chunk', text: 'score est MR 42.' });

    expect(second).toBe('Le pire score est MR 42.');
  });

  it('leaves the answer unchanged for a non-chunk event', () => {
    expect(foldAnswer('déjà là', { type: 'status', state: 'working' })).toBe('déjà là');
  });
});

describe('avatarStateFromEvent', () => {
  it('maps a working status to the working avatar state', () => {
    expect(avatarStateFromEvent({ type: 'status', state: 'working' })).toBe('working');
  });

  it('maps an idle status to the idle avatar state', () => {
    expect(avatarStateFromEvent({ type: 'status', state: 'idle' })).toBe('idle');
  });

  it('maps an error event to the error avatar state', () => {
    expect(
      avatarStateFromEvent({ type: 'error', message: '// EMBER INDISPONIBLE — réessayer' }),
    ).toBe('error');
  });

  it('returns null for an event that does not change the avatar', () => {
    expect(avatarStateFromEvent({ type: 'chunk', text: 'x' })).toBeNull();
  });
});

describe('shouldShowRetry', () => {
  it('shows the retry control after an error event', () => {
    expect(shouldShowRetry([{ type: 'error', message: 'x' }])).toBe(true);
  });

  it('hides the retry control while answering normally', () => {
    expect(
      shouldShowRetry([
        { type: 'status', state: 'working' },
        { type: 'chunk', text: 'x' },
      ]),
    ).toBe(false);
  });
});

describe('shouldSendQuestion', () => {
  it('does not send an empty question', () => {
    expect(shouldSendQuestion('')).toBe(false);
  });

  it('does not send a whitespace-only question', () => {
    expect(shouldSendQuestion('   ')).toBe(false);
  });

  it('sends a non-empty question', () => {
    expect(shouldSendQuestion('Quel projet a le pire score ?')).toBe(true);
  });
});
