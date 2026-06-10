import { describe, it, expect } from 'vitest';

import { serializeSetupInput } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';

describe('serializeSetupInput', () => {
  it('writes a text answer as the raw string the gateway reads verbatim', () => {
    expect(serializeSetupInput({ kind: 'text', value: '/home/u/api' })).toBe('/home/u/api');
  });

  it('writes an empty text answer as an empty string so the default applies', () => {
    expect(serializeSetupInput({ kind: 'text', value: '' })).toBe('');
  });

  it('writes a confirm answer as a JSON boolean', () => {
    expect(serializeSetupInput({ kind: 'confirm', value: true })).toBe('true');
    expect(serializeSetupInput({ kind: 'confirm', value: false })).toBe('false');
  });

  it('writes a choice answer as a JSON string', () => {
    expect(serializeSetupInput({ kind: 'choice', value: 'backend' })).toBe('"backend"');
  });

  it('writes a multi-select answer as a JSON array', () => {
    expect(serializeSetupInput({ kind: 'multiSelect', value: ['solid', 'testing'] })).toBe(
      '["solid","testing"]',
    );
  });
});
