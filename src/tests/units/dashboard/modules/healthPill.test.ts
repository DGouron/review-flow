import { afterEach, describe, expect, it } from 'vitest';

import {
  buildHealthModel,
  renderHealthLinesHtml,
  renderHealthPillHtml,
} from '@/dashboard/modules/healthPill.js';
import { setLanguage, t } from '@/dashboard/modules/i18n.js';

function healthyInput(overrides: Record<string, unknown> = {}) {
  return {
    claude: { state: 'ok', detail: '2.1.332' },
    platform: { kind: 'github', state: 'ok', detail: '@octocat' },
    connection: 'websocket',
    worktrees: { active: 2, disk: '745 MB', failed: 0 },
    version: { current: '3.56.2', latest: null, updateAvailable: false },
    ...overrides,
  };
}

describe('buildHealthModel', () => {
  it('reads operational when every service answers', () => {
    const model = buildHealthModel(healthyInput());

    expect(model.tone).toBe('ok');
    expect(model.labelKey).toBe('health.label.ok');
    expect(model.lines.map((line) => line.key)).toEqual([
      'claude',
      'platform',
      'updates',
      'worktrees',
      'version',
    ]);
  });

  it('turns red when Claude or the platform CLI is down, or the server is unreachable', () => {
    expect(
      buildHealthModel(healthyInput({ claude: { state: 'error', detail: 'not logged in' } })).tone,
    ).toBe('error');
    expect(
      buildHealthModel(healthyInput({ platform: { kind: 'github', state: 'error', detail: null } }))
        .tone,
    ).toBe('error');
    expect(buildHealthModel(healthyInput({ connection: 'offline' })).tone).toBe('error');
  });

  it('asks for attention when an update waits or a worktree failed', () => {
    const withUpdate = buildHealthModel(
      healthyInput({ version: { current: '3.56.2', latest: '3.57.0', updateAvailable: true } }),
    );
    const withFailure = buildHealthModel(
      healthyInput({ worktrees: { active: 1, disk: '1 GB', failed: 2 } }),
    );

    expect(withUpdate.tone).toBe('warn');
    expect(withFailure.tone).toBe('warn');
  });

  it('keeps polling as a warning on its line only', () => {
    const model = buildHealthModel(healthyInput({ connection: 'polling' }));

    expect(model.tone).toBe('ok');
    expect(model.lines.find((line) => line.key === 'updates')?.tone).toBe('warn');
  });

  it('reports a check in progress while Claude is being checked', () => {
    expect(
      buildHealthModel(healthyInput({ claude: { state: 'checking', detail: null } })).tone,
    ).toBe('checking');
  });

  it('leaves the platform line neutral before a project is opened', () => {
    const model = buildHealthModel(
      healthyInput({ platform: { kind: null, state: 'checking', detail: null } }),
    );

    expect(model.tone).toBe('ok');
    expect(model.lines.find((line) => line.key === 'platform')?.tone).toBe('neutral');
  });
});

describe('renderHealthPillHtml', () => {
  afterEach(() => setLanguage('en'));

  it('renders the overall tone and label of the single pill', () => {
    setLanguage('fr');
    const html = renderHealthPillHtml(buildHealthModel(healthyInput()), t);

    expect(html).toContain('dot-ok');
    expect(html).toContain('Opérationnel');
  });
});

describe('renderHealthLinesHtml', () => {
  afterEach(() => setLanguage('en'));

  it('lists each service with its detail', () => {
    setLanguage('fr');
    const html = renderHealthLinesHtml(buildHealthModel(healthyInput()), t);

    expect(html).toContain('Claude CLI');
    expect(html).toContain('@octocat');
    expect(html).toContain('2 actifs · 745 MB');
    expect(html).toContain('En direct (WebSocket)');
  });

  it('escapes service details and tells when a newer version waits', () => {
    const html = renderHealthLinesHtml(
      buildHealthModel(
        healthyInput({
          claude: { state: 'error', detail: '<b>down</b>' },
          version: { current: '3.56.2', latest: '3.57.0', updateAvailable: true },
        }),
      ),
      t,
    );

    expect(html).toContain('&lt;b&gt;down&lt;/b&gt;');
    expect(html).toContain('3.56.2 · 3.57.0 available');
  });

  it('shows a check in progress instead of an empty value', () => {
    const html = renderHealthLinesHtml(
      buildHealthModel(healthyInput({ claude: { state: 'checking', detail: null } })),
      t,
    );

    expect(html).toContain('Checking…');
  });
});
