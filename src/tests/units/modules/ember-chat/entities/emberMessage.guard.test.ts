import { describe, it, expect } from 'vitest';

import { emberMessageGuard } from '@/modules/ember-chat/entities/emberMessage/emberMessage.guard.js';

describe('emberMessageGuard', () => {
  it('accepts a non-empty question', () => {
    const result = emberMessageGuard.safeParse({ question: 'Quel projet a le pire score ?' });

    expect(result.success).toBe(true);
  });

  it('rejects an empty question', () => {
    const result = emberMessageGuard.safeParse({ question: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only question', () => {
    const result = emberMessageGuard.safeParse({ question: '   ' });

    expect(result.success).toBe(false);
  });

  it('trims surrounding whitespace from a valid question', () => {
    const result = emberMessageGuard.safeParse({ question: '  bonjour  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question).toBe('bonjour');
    }
  });
});
