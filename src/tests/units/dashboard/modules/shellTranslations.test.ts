import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { shellTranslations } from '@/dashboard/modules/shellTranslations.js';

describe('shellTranslations', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('offers every shell key in both English and French', () => {
    expect(Object.keys(shellTranslations.fr).sort()).toEqual(
      Object.keys(shellTranslations.en).sort(),
    );
  });

  it('never prefixes a label with "//" nor writes it in capitals', () => {
    const labels = [...Object.values(shellTranslations.en), ...Object.values(shellTranslations.fr)];

    expect(labels.filter((label) => label.startsWith('//'))).toEqual([]);
    expect(labels.filter((label) => /^[A-Z\s]{6,}$/.test(label))).toEqual([]);
  });

  it('is reachable through the dashboard translator in the chosen language', () => {
    setLanguage('fr');

    expect(t('queue.lane.approve')).toBe('À approuver');
    expect(t('queue.age.days', { count: 3 })).toBe('il y a 3 j');
  });
});
