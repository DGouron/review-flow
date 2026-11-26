import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import { monitoringTranslations } from '@/dashboard/modules/monitoringTranslations.js';

describe('monitoringTranslations', () => {
  afterEach(() => setLanguage('en'));

  it('offers every Monitoring key in both English and French', () => {
    expect(Object.keys(monitoringTranslations.fr).toSorted()).toEqual(
      Object.keys(monitoringTranslations.en).toSorted(),
    );
  });

  it('is reachable through the dashboard translator in the chosen language', () => {
    setLanguage('fr');

    expect(t('shell.view.monitoring')).toBe('Monitoring');
    expect(t('monitoring.sessions.empty')).toBe('Aucune session de revue active');
    expect(t('monitoring.unavailable')).toBe('indisponible');
  });
});
