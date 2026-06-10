import { resolveProvenance } from '@/modules/review-execution/entities/actionProvenance/actionProvenance.js';

describe('resolveProvenance (AC-1 fail-closed provenance)', () => {
  const nonCanonical: unknown[] = [
    undefined,
    null,
    '',
    'TRUSTED',
    'trusted ',
    ' trusted',
    'Trusted',
    'untrusted',
    'admin',
    {},
    0,
    true,
  ];

  for (const input of nonCanonical) {
    it(`resolves non-canonical input ${JSON.stringify(input)} to untrusted`, () => {
      expect(resolveProvenance(input)).toBe('untrusted');
    });
  }

  it('resolves the exact canonical token "trusted" to trusted', () => {
    expect(resolveProvenance('trusted')).toBe('trusted');
  });
});
