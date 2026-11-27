import { describe, expect, it } from 'vitest';

import {
  isRoleSessionName,
  roleSessionNameOf,
  type RoleSessionSubject,
} from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

describe('isRoleSessionName', () => {
  it.each(['Revue #2111 · lot bugs', 'Suivi #7 · arbitre', 'Revue #1 · lot tests'])(
    'recognizes %s',
    (name) => {
      expect(isRoleSessionName(name)).toBe(true);
    },
  );

  it.each([
    null,
    'Revue #2111',
    'Revue #2111 · lot perf',
    'Parcours · apprenants lisent la version publiée',
    'Revue #abc · greffe',
    'My Revue #12 · greffe',
  ])('does not recognize %j', (name) => {
    expect(isRoleSessionName(name)).toBe(false);
  });

  it('does not recognize the clerk by its name: in an orchestrated review it is the review session itself', () => {
    expect(isRoleSessionName('Revue #2111 · greffe')).toBe(false);
  });
});

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

  it('writes the lots in words', () => {
    const subject: RoleSessionSubject = { jobType: 'review', mergeRequestNumber: 1 };

    expect(roleSessionNameOf(subject, 'lot:tests')).toBe('Revue #1 · lot tests');
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
