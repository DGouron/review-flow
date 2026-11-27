import { describe, expect, it } from 'vitest';

import {
  roleSessionNameOf,
  type RoleSessionSubject,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

describe('roleSessionNameOf', () => {
  it('names a review role session after the pull request and the role in words', () => {
    expect(roleSessionNameOf({ jobType: 'review', mergeRequestNumber: 2111 }, 'lot:bugs')).toBe(
      'Revue #2111 · lot bugs',
    );
  });

  it('names a follow-up role session "Suivi"', () => {
    expect(roleSessionNameOf({ jobType: 'followup', mergeRequestNumber: 7 }, 'arbitre')).toBe(
      'Suivi #7 · arbitre',
    );
  });

  it('writes the accented lots in words', () => {
    const subject: RoleSessionSubject = { jobType: 'review', mergeRequestNumber: 1 };

    expect(roleSessionNameOf(subject, 'lot:securite')).toBe('Revue #1 · lot sécurité');
    expect(roleSessionNameOf(subject, 'lot:lisibilite')).toBe('Revue #1 · lot lisibilité');
  });

  it('never exceeds six words', () => {
    const name = roleSessionNameOf(
      { jobType: 'review', mergeRequestNumber: 123456 },
      'lot:architecture',
    );

    expect(name.split(' ').length).toBeLessThanOrEqual(6);
  });
});
