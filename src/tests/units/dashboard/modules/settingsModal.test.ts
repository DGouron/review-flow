import { describe, expect, it } from 'vitest';

import { setLanguage } from '@/dashboard/modules/i18n.js';
import {
  buildSettingsViewModel,
  renderGlobalSettingsHtml,
  renderSettingsModalHtml,
  validateExternalLink,
  validateMaxDiffLines,
  validateQualityThreshold,
  extractFormPayload,
} from '@/dashboard/modules/settingsModal.js';

describe('settingsModal — buildSettingsViewModel', () => {
  it('populates the five editable fields plus projectName', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'opus',
        reviewSkill: 'review-back',
        reviewFollowupSkill: 'review-followup',
        language: 'en',
        retentionDays: 14,
        externalLink: 'https://notion.so/x',
      },
      projectName: 'A',
    });

    expect(viewModel.language).toBe('en');
    expect(viewModel.defaultModel).toBe('opus');
    expect(viewModel.reviewSkill).toBe('review-back');
    expect(viewModel.reviewFollowupSkill).toBe('review-followup');
    expect(viewModel.externalLink).toBe('https://notion.so/x');
    expect(viewModel.projectName).toBe('A');
  });

  it('exposes an empty externalLink when the config has no link', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
      },
      projectName: 'B',
    });

    expect(viewModel.externalLink).toBe('');
  });

  it('falls back to "—" when projectName is missing', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
      },
    });

    expect(viewModel.projectName).toBe('—');
  });
});

describe('settingsModal — renderSettingsModalHtml', () => {
  it('renders fr/en radios with the current language pre-checked', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'A',
    });

    expect(html).toMatch(/<input[^>]+name="language"[^>]+value="fr"[^>]+checked/);
    expect(html).toMatch(/<input[^>]+name="language"[^>]+value="en"(?![^>]*checked)/);
  });

  it('renders the three model options with the current value selected', () => {
    const html = renderSettingsModalHtml({
      language: 'en',
      defaultModel: 'opus',
      reviewSkill: 'review-back',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'A',
    });

    expect(html).toMatch(/<option[^>]+value="haiku"/);
    expect(html).toMatch(/<option[^>]+value="sonnet"/);
    expect(html).toMatch(/<option[^>]+value="opus"[^>]+selected/);
  });

  it('renders the externalLink input pre-filled with the current value', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: 'https://notion.so/x',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'A',
    });

    expect(html).toContain('https://notion.so/x');
    expect(html).toMatch(/name="externalLink"/);
  });

  it('exposes a title with the project name', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'frontend',
    });

    expect(html).toContain('frontend');
    expect(html).toContain('settings-modal__title');
  });

  it('contains an error placeholder element for inline messages', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'A',
    });

    expect(html).toContain('settings-modal__error');
  });
});

describe('settingsModal — validateExternalLink', () => {
  it('accepts an empty string', () => {
    expect(validateExternalLink('')).toEqual({ ok: true });
  });

  it('accepts an https url', () => {
    expect(validateExternalLink('https://example.com')).toEqual({ ok: true });
  });

  it('rejects http with the French HTTPS message', () => {
    expect(validateExternalLink('http://example.com')).toEqual({
      ok: false,
      message: 'Le lien doit être en HTTPS',
    });
  });

  it('rejects javascript: with "URL invalide"', () => {
    expect(validateExternalLink('javascript:alert(1)')).toEqual({
      ok: false,
      message: 'URL invalide',
    });
  });

  it('rejects free text with "URL invalide"', () => {
    expect(validateExternalLink('not a url')).toEqual({
      ok: false,
      message: 'URL invalide',
    });
  });
});

describe('settingsModal — extractFormPayload', () => {
  it('returns the six whitelisted keys (incl. qualityThreshold) from a FormData-like object', () => {
    const fakeForm = new Map<string, string>([
      ['language', 'en'],
      ['defaultModel', 'sonnet'],
      ['reviewSkill', 'review-front'],
      ['reviewFollowupSkill', 'review-followup'],
      ['externalLink', 'https://notion.so/x'],
      ['qualityThreshold', 'B'],
      ['agents', '[{"name":"evil"}]'],
      ['retentionDays', '999'],
    ]);

    const payload = extractFormPayload(fakeForm);

    expect(Object.keys(payload).toSorted()).toEqual([
      'defaultModel',
      'externalLink',
      'language',
      'qualityThreshold',
      'reviewFollowupSkill',
      'reviewSkill',
    ]);
    expect(payload.language).toBe('en');
    expect(payload.externalLink).toBe('https://notion.so/x');
    expect(payload.qualityThreshold).toBe('B');
  });
});

describe('settingsModal — buildSettingsViewModel with qualityThreshold', () => {
  it('exposes qualityThreshold as a string when the config has a value', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
        qualityThreshold: 'B',
      },
      projectName: 'A',
    });

    expect(viewModel.qualityThreshold).toBe('B');
  });

  it('exposes an empty qualityThreshold when the config has none', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
      },
      projectName: 'A',
    });

    expect(viewModel.qualityThreshold).toBe('');
  });
});

describe('settingsModal — renderSettingsModalHtml renders qualityThreshold select', () => {
  const viewModelWith = (qualityThreshold: string) => ({
    language: 'fr' as const,
    defaultModel: 'sonnet' as const,
    reviewSkill: 'review-front',
    reviewFollowupSkill: 'review-followup',
    externalLink: '',
    qualityThreshold,
    maxConcurrentReviews: '2',
    maxDiffLines: '',
    projectName: 'A',
  });

  it('offers no threshold and every grade from A to E', () => {
    const html = renderSettingsModalHtml(viewModelWith(''));

    expect(html).toMatch(/<select[^>]+name="qualityThreshold"/);
    for (const grade of ['A', 'B', 'C', 'D', 'E']) {
      expect(html).toContain(`<option value="${grade}"`);
    }
    expect(html).toMatch(/<option value="" selected>/);
  });

  it('selects the current grade', () => {
    const html = renderSettingsModalHtml(viewModelWith('B'));

    expect(html).toMatch(/<option value="B" selected>/);
    expect(html).not.toMatch(/<option value="" selected>/);
  });
});

describe('settingsModal — validateQualityThreshold', () => {
  it('accepts an empty string (means clear)', () => {
    expect(validateQualityThreshold('')).toEqual({ ok: true });
  });

  it('accepts every grade from A to E', () => {
    for (const value of ['A', 'B', 'C', 'D', 'E']) {
      expect(validateQualityThreshold(value)).toEqual({ ok: true });
    }
  });

  it.each(['F', '7', 'b+'])('rejects %s', (value) => {
    expect(validateQualityThreshold(value)).toEqual({
      ok: false,
      message: 'Le seuil doit être une lettre de A à E',
    });
  });
});

describe('settingsModal — validateMaxDiffLines', () => {
  it('accepts an empty string (means clear)', () => {
    expect(validateMaxDiffLines('')).toEqual({ ok: true });
  });

  it('accepts positive integer values', () => {
    for (const value of ['1', '1500', '99999']) {
      expect(validateMaxDiffLines(value)).toEqual({ ok: true });
    }
  });

  it('rejects zero and negative values', () => {
    expect(validateMaxDiffLines('0').ok).toBe(false);
    expect(validateMaxDiffLines('-5').ok).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(validateMaxDiffLines('12.5').ok).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(validateMaxDiffLines('abc').ok).toBe(false);
  });
});

describe('settingsModal — renderSettingsModalHtml renders maxDiffLines input', () => {
  it('renders a number input pre-filled with the maxDiffLines value', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
        maxDiffLines: 1500,
      },
      projectName: 'A',
    });

    const html = renderSettingsModalHtml(viewModel);

    expect(viewModel.maxDiffLines).toBe('1500');
    expect(html).toContain('name="maxDiffLines"');
    expect(html).toContain('value="1500"');
  });
});

describe('settingsModal — renderGlobalSettingsHtml', () => {
  const globalSettings = {
    model: 'sonnet',
    triggerMode: 'semi-auto',
    reviewTimeout: { minutes: 45, min: 5, max: 480 },
  };

  it('gathers model, trigger mode and timeout, the review settings that left the header', () => {
    const html = renderGlobalSettingsHtml(globalSettings);

    expect(html).toContain('id="model-select"');
    expect(html).toMatch(/<option value="sonnet" selected/);
    expect(html).toContain('id="trigger-mode-select"');
    expect(html).toMatch(/<option value="semi-auto" selected/);
    expect(html).toContain('id="review-timeout-input"');
    expect(html).toContain('value="45" min="5" max="480"');
  });

  it('speaks the dashboard language without "//" prefixes', () => {
    setLanguage('fr');
    const html = renderGlobalSettingsHtml(globalSettings);
    setLanguage('en');

    expect(html).toContain('Déclenchement');
    expect(html).not.toContain('//');
  });
});

describe('settingsModal — project title', () => {
  it('titles the project section without a "//" prefix', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      qualityThreshold: '',
      maxConcurrentReviews: '2',
      maxDiffLines: '',
      projectName: 'frontend',
    });

    expect(html).toContain('Project: frontend');
    expect(html).not.toContain('// SETTINGS');
  });
});
