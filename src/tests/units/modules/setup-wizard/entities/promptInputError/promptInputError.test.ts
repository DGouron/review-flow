import { describe, it, expect } from 'vitest';

import {
  AwaitingInputClosedError,
  NonInteractiveInputError,
} from '@/modules/setup-wizard/entities/promptInputError/promptInputError.js';

describe('AwaitingInputClosedError', () => {
  it('is an Error identifiable via instanceof', () => {
    const error = new AwaitingInputClosedError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AwaitingInputClosedError);
  });

  it('carries the French remediation message', () => {
    const error = new AwaitingInputClosedError();

    expect(error.message).toBe('Aucune réponse reçue, le setup est interrompu');
  });
});

describe('NonInteractiveInputError', () => {
  it('is an Error identifiable via instanceof', () => {
    const error = new NonInteractiveInputError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NonInteractiveInputError);
  });

  it('carries the French non-interactive message', () => {
    const error = new NonInteractiveInputError();

    expect(error.message).toBe('Mode non-interactif : aucune entrée disponible pour cette étape');
  });
});
