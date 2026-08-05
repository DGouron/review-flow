import { beforeEach, describe, it, expect } from 'vitest';

import { setLanguage, t } from '@/dashboard/modules/i18n.js';
import {
  renderVersionUpdateArea,
  setVersionCheckState,
  resolveRefusalWording,
} from '@/dashboard/modules/versionUpdate.js';

const translate = (key: string, params?: Record<string, string | number>) =>
  params?.version ? `${key}:${params.version}` : key;

describe('renderVersionUpdateArea', () => {
  it('renders only the current version label when no update is available', () => {
    const html = renderVersionUpdateArea(
      { currentVersion: '3.10.0', updateAvailable: false, latestVersion: null },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).not.toContain('version-update-btn');
  });

  it('renders an update button mentioning the latest version when available', () => {
    const html = renderVersionUpdateArea(
      { currentVersion: '3.10.0', updateAvailable: true, latestVersion: '4.0.0' },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).toContain('4.0.0');
    expect(html).toContain('version-update-btn');
    expect(html).toContain('triggerVersionUpdate()');
  });

  it('never renders the removed source-checkout info button', () => {
    const html = renderVersionUpdateArea(
      { currentVersion: '3.10.0', updateAvailable: true, latestVersion: '4.0.0' },
      translate,
    );
    expect(html).not.toContain('version-source-checkout-btn');
    expect(html).not.toContain('showSourceCheckoutUpdate');
  });
});

interface FakeElement {
  disabled: boolean;
  dataset: Record<string, string>;
  classList: { add: (className: string) => void; remove: (className: string) => void };
  querySelector: (selector: string) => { textContent: string } | null;
}

function createFakeButton(defaultLabel: string): FakeElement {
  const span = { textContent: defaultLabel };
  return {
    disabled: false,
    dataset: { defaultLabel },
    classList: { add: () => {}, remove: () => {} },
    querySelector: () => span,
  };
}

function stubDocument(elements: Record<string, FakeElement>): void {
  Object.defineProperty(globalThis, 'document', {
    value: { getElementById: (id: string) => elements[id] ?? null },
    configurable: true,
  });
}

describe('setVersionCheckState', () => {
  it('disables the update button and shows the updating label while updating', () => {
    const updateBtn = createFakeButton('Update to v4.0.0');
    stubDocument({ 'version-update-btn': updateBtn });

    setVersionCheckState('updating', t);

    expect(updateBtn.disabled).toBe(true);
    expect(updateBtn.querySelector('span')?.textContent).toBe(t('version.updating'));
  });

  it('returns the update button to its default clickable state on idle', () => {
    const updateBtn = createFakeButton('Update to v4.0.0');
    updateBtn.disabled = true;
    const span = updateBtn.querySelector('span');
    if (span) span.textContent = t('version.updating');
    stubDocument({ 'version-update-btn': updateBtn });

    setVersionCheckState('idle', t);

    expect(updateBtn.disabled).toBe(false);
    expect(updateBtn.querySelector('span')?.textContent).toBe('Update to v4.0.0');
  });
});

describe('resolveRefusalWording', () => {
  beforeEach(() => {
    setLanguage('fr');
  });

  it('words the local-only motive in French', () => {
    expect(resolveRefusalWording({ kind: 'local-only' }, t)).toBe(
      'Mise à jour autorisée uniquement depuis la machine locale',
    );
  });

  it('words the reviews-in-progress motive in French with the singular count', () => {
    expect(resolveRefusalWording({ kind: 'reviews-in-progress', count: 1 }, t)).toBe(
      '1 review en cours. Réessayez une fois les reviews terminées.',
    );
  });

  it('words the reviews-in-progress motive in French with the plural count', () => {
    expect(resolveRefusalWording({ kind: 'reviews-in-progress', count: 2 }, t)).toBe(
      '2 reviews en cours. Réessayez une fois les reviews terminées.',
    );
  });

  it('words the wrong-branch motive in French', () => {
    expect(resolveRefusalWording({ kind: 'wrong-branch' }, t)).toBe(
      'Mise à jour possible uniquement depuis la branche master',
    );
  });

  it('words the dirty-checkout motive in French', () => {
    expect(resolveRefusalWording({ kind: 'dirty-checkout' }, t)).toBe(
      'Des modifications locales ne sont pas validées. Mise à jour impossible.',
    );
  });

  it('words the missing-tool motive in French naming the tool', () => {
    expect(resolveRefusalWording({ kind: 'missing-tool', tool: 'yarn' }, t)).toBe(
      'Commande yarn introuvable',
    );
  });

  it('words the fetch-failed motive in French, appending the untranslated detail', () => {
    const detail = 'CONFLICT (content): Merge conflict in src/index.ts';
    expect(resolveRefusalWording({ kind: 'fetch-failed', detail }, t)).toBe(
      `La récupération des modifications a échoué : ${detail}`,
    );
  });

  it('words the rebuild-failed motive in French', () => {
    expect(resolveRefusalWording({ kind: 'rebuild-failed' }, t)).toBe(
      'La compilation a échoué. Le serveur continue de tourner sur la version précédente.',
    );
  });

  it('words the same motive differently in English than in French, keeping the count', () => {
    const french = resolveRefusalWording({ kind: 'reviews-in-progress', count: 2 }, t);
    setLanguage('en');
    const english = resolveRefusalWording({ kind: 'reviews-in-progress', count: 2 }, t);

    expect(english).not.toBe(french);
    expect(english).toContain('2');
  });
});
