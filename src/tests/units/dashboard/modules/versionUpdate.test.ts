import { describe, it, expect } from 'vitest';

import { renderVersionUpdateArea } from '@/dashboard/modules/versionUpdate.js';

const translate = (key: string, params?: Record<string, string | number>) =>
  params?.version ? `${key}:${params.version}` : key;

describe('renderVersionUpdateArea', () => {
  it('renders only the current version label when no update is available', () => {
    const html = renderVersionUpdateArea(
      {
        currentVersion: '3.10.0',
        updateAvailable: false,
        latestVersion: null,
        installType: 'global-npm',
      },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).not.toContain('version-update-btn');
  });

  it('renders an update button mentioning the latest version when available on a global-npm install', () => {
    const html = renderVersionUpdateArea(
      {
        currentVersion: '3.10.0',
        updateAvailable: true,
        latestVersion: '4.0.0',
        installType: 'global-npm',
      },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).toContain('4.0.0');
    expect(html).toContain('version-update-btn');
  });

  it('renders a source-checkout info button (not an update button) when running from a source checkout', () => {
    const html = renderVersionUpdateArea(
      {
        currentVersion: '3.10.0',
        updateAvailable: true,
        latestVersion: '4.0.0',
        installType: 'source-checkout',
      },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).toContain('4.0.0');
    expect(html).toContain('version-source-checkout-btn');
    expect(html).not.toContain('version-update-btn');
  });

  it('omits any update or info button on a source-checkout install when no update is available', () => {
    const html = renderVersionUpdateArea(
      {
        currentVersion: '3.10.0',
        updateAvailable: false,
        latestVersion: null,
        installType: 'source-checkout',
      },
      translate,
    );
    expect(html).toContain('v3.10.0');
    expect(html).not.toContain('version-update-btn');
    expect(html).not.toContain('version-source-checkout-btn');
  });
});
