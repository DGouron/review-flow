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
});
