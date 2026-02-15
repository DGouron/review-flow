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

  it('should translate focus strip labels in English', () => {
    expect(t('strip.now')).toBe('To handle now');
    expect(t('strip.nowMeta')).toBe('Running reviews + MRs pending fix');
    expect(t('strip.modeCompact')).toBe('Compact view');
    expect(t('lane.nowKicker')).toBe('Take action now');
  });

  it('should translate quality labels in English', () => {
    expect(t('quality.onTarget')).toBe('On target');
    expect(t('quality.progress')).toBe('Progress');
    expect(t('quality.trendUp', { delta: '+1.0' })).toBe('Improving +1.0');
    expect(t('quality.trendUnknown')).toBe('No trend yet');
  });

  it('should translate queue and metrics labels in English', () => {
    expect(t('section.queueLanes')).toBe('Priority lanes');
    expect(t('queueLane.readyToApprove')).toBe('Ready for approval');
    expect(t('metrics.priorityResolution')).toBe('Priority resolution');
    expect(t('metrics.breakdown')).toBe('Action breakdown');
    expect(t('metrics.action.followup')).toBe('Followup');
    expect(t('metrics.action.cancelReview')).toBe('Cancel');
  });

  it('should translate notification and review labels in English', () => {
    expect(t('loading.data')).toBe('Syncing dashboard data...');
    expect(t('review.status.running')).toBe('Review in progress');
    expect(t('button.followup')).toBe('Run follow-up');
    expect(t('review.type.followup')).toBe('Follow-up');
    expect(t('notify.reviewStarted', { mrNumber: 42 })).toBe('Review started for !42');
    expect(t('notify.followupCompleted', { mrNumber: 42 })).toBe('Follow-up completed for !42');
    expect(t('notify.desktopTitle')).toBe('Reviewflow alert');
    expect(t('mr.threads.openAction', { count: 2 })).toBe('2 open - fix now');
    expect(t('loading.status')).toBe('Refreshing live status...');
  });

  it('should translate focus strip labels in French', () => {
    setLanguage('fr');
    expect(t('strip.now')).toBe('À traiter');
    expect(t('strip.nowMeta')).toBe('Reviews en cours + MR en attente de correctif');
    expect(t('strip.modeCompact')).toBe('Vue compacte');
    expect(t('lane.nowKicker')).toBe('Action prioritaire');
  });

  it('should translate quality labels in French', () => {
    setLanguage('fr');
    expect(t('quality.onTarget')).toBe('Objectif atteint');
    expect(t('quality.progress')).toBe('Progression');
    expect(t('quality.trendUp', { delta: '+1.0' })).toBe('En amélioration +1.0');
    expect(t('quality.trendUnknown')).toBe('Pas de tendance');
  });

  it('should translate queue and metrics labels in French', () => {
    setLanguage('fr');
    expect(t('section.queueLanes')).toBe('Priorité');
    expect(t('queueLane.readyToApprove')).toBe('Prêtes pour approbation');
    expect(t('metrics.priorityResolution')).toBe('Résolution des priorités');
    expect(t('metrics.breakdown')).toBe('Détail des actions');
    expect(t('metrics.action.followup')).toBe('Followup');
    expect(t('metrics.action.cancelReview')).toBe('Annuler');
  });

  it('should translate notification and review labels in French', () => {
    setLanguage('fr');
    expect(t('loading.data')).toBe('Synchronisation des données du dashboard...');
    expect(t('review.status.running')).toBe('Review en cours');
    expect(t('button.followup')).toBe('Lancer le follow-up');
    expect(t('review.type.followup')).toBe('Follow-up');
    expect(t('notify.reviewStarted', { mrNumber: 42 })).toBe('Review démarrée pour !42');
    expect(t('notify.followupCompleted', { mrNumber: 42 })).toBe('Follow-up terminé pour !42');
    expect(t('notify.desktopTitle')).toBe('Alerte Reviewflow');
    expect(t('mr.threads.openAction', { count: 2 })).toBe('2 ouvert(s) - corriger maintenant');
    expect(t('loading.status')).toBe('Rafraîchissement du statut en direct...');
  });
});
