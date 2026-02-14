import { describe, it, expect, beforeEach } from 'vitest';
import { getLanguage, setLanguage, t } from '@/interface-adapters/views/dashboard/modules/i18n.js';

describe('i18n', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('should default to English language', () => {
    expect(getLanguage()).toBe('en');
  });

  it('should change language to French', () => {
    setLanguage('fr');
    expect(getLanguage()).toBe('fr');
  });

  it('should return English translation for a known key', () => {
    const result = t('time.justNow');
    expect(result).toBe('Just now');
  });

  it('should return French translation when language is fr', () => {
    setLanguage('fr');
    const result = t('time.justNow');
    expect(result).toBe("À l'instant");
  });

  it('should return the key itself when translation is missing', () => {
    const result = t('nonexistent.key');
    expect(result).toBe('nonexistent.key');
  });

  it('should replace multiple occurrences of the same param', () => {
    const result = t('modal.cancel.title', { type: 'review', label: 'MR', number: 42 });
    expect(result).toBe('Cancel the review of MR !42 (review)?');
  });

  it('should translate focus strip labels in both languages', () => {
    expect(t('strip.now')).toBe('To handle now');
    expect(t('strip.nowMeta')).toBe('Running reviews + MRs pending fix');
    expect(t('strip.modeCompact')).toBe('Compact view');
    expect(t('lane.nowKicker')).toBe('Take action now');
    expect(t('quality.onTarget')).toBe('On target');
    expect(t('loading.data')).toBe('Syncing dashboard data...');
    expect(t('review.status.running')).toBe('In review now');
    expect(t('mr.threads.openAction', { count: 2 })).toBe('2 open - fix now');
    expect(t('loading.status')).toBe('Refreshing live status...');
    setLanguage('fr');
    expect(t('strip.now')).toBe('À traiter');
    expect(t('strip.nowMeta')).toBe('Reviews en cours + MR en attente de correctif');
    expect(t('strip.modeCompact')).toBe('Vue compacte');
    expect(t('lane.nowKicker')).toBe('Action prioritaire');
    expect(t('quality.onTarget')).toBe('Objectif atteint');
    expect(t('loading.data')).toBe('Synchronisation des données du dashboard...');
    expect(t('review.status.running')).toBe('En review maintenant');
    expect(t('mr.threads.openAction', { count: 2 })).toBe('2 ouvert(s) - corriger maintenant');
    expect(t('loading.status')).toBe('Rafraîchissement du statut en direct...');
  });
});
