import { describe, it, expect } from 'vitest';

import {
  buildStepRowsModel,
  buildBannerModel,
  statusToDotClass,
  statusToLabel,
  buildAriaAnnouncement,
  renderStepRow,
} from '@/dashboard/modules/setupWizard.js';
import { STEP_IDS } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';

describe('buildStepRowsModel', () => {
  it('returns the 10 step rows in StepId order with a pending initial state', () => {
    const rows = buildStepRowsModel([]);

    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.id)).toEqual([...STEP_IDS]);
    for (const row of rows) {
      expect(row.status).toBe('pending');
    }
  });

  it('transitions a step to in_progress when its started event is consumed', () => {
    const rows = buildStepRowsModel([
      { step: 'dependencies', status: 'in_progress', message: 'Checking' },
    ]);

    const row = rows.find((entry) => entry.id === 'dependencies');
    expect(row?.status).toBe('in_progress');
    expect(row?.message).toBe('Checking');
  });

  it('keeps the latest status when a step receives started then completed', () => {
    const rows = buildStepRowsModel([
      { step: 'daemon', status: 'in_progress', message: 'Installing' },
      { step: 'daemon', status: 'succeeded', message: 'Installed', remediation: null },
    ]);

    const row = rows.find((entry) => entry.id === 'daemon');
    expect(row?.status).toBe('succeeded');
    expect(row?.message).toBe('Installed');
  });

  it('carries the remediation on a blocked step', () => {
    const rows = buildStepRowsModel([
      {
        step: 'pipeline',
        status: 'blocked',
        message: 'No remote',
        remediation: 'Add a git remote',
      },
    ]);

    const row = rows.find((entry) => entry.id === 'pipeline');
    expect(row?.status).toBe('blocked');
    expect(row?.remediation).toBe('Add a git remote');
  });

  it('renders an awaiting_input step read-only with its prompt as the message', () => {
    const rows = buildStepRowsModel([
      { step: 'add-project', status: 'awaiting_input', prompt: 'Chemin du projet ?' },
    ]);

    const row = rows.find((entry) => entry.id === 'add-project');
    expect(row?.status).toBe('awaiting_input');
    expect(row?.message).toBe('Chemin du projet ?');
  });

  it('never includes banner events as step rows', () => {
    const rows = buildStepRowsModel([
      { step: 'instructions', status: 'info', lines: ['x'] },
      { step: 'warning', status: 'warning', message: 'careful' },
      { step: 'resume', status: 'resumed', resumeAt: 'secrets', position: 4, total: 10 },
      { step: 'done', status: 'completed', summary: {} },
    ]);

    expect(rows).toHaveLength(10);
    const ids = rows.map((row) => row.id);
    expect(ids).not.toContain('instructions');
    expect(ids).not.toContain('warning');
    expect(ids).not.toContain('resume');
    expect(ids).not.toContain('done');
  });
});

describe('buildBannerModel', () => {
  it('maps resume to a banner with position and total', () => {
    const banners = buildBannerModel([
      { step: 'resume', status: 'resumed', resumeAt: 'secrets', position: 4, total: 10 },
    ]);

    expect(banners).toHaveLength(1);
    expect(banners[0].kind).toBe('resume');
    expect(banners[0].position).toBe(4);
    expect(banners[0].total).toBe(10);
  });

  it('maps done, warning and instructions to banners', () => {
    const banners = buildBannerModel([
      { step: 'done', status: 'completed', summary: { project: 'owner/repo' } },
      { step: 'warning', status: 'warning', message: 'careful' },
      { step: 'instructions', status: 'info', lines: ['line a', 'line b'] },
    ]);

    expect(banners.map((banner) => banner.kind)).toEqual(['done', 'warning', 'instructions']);
  });

  it('ignores step events', () => {
    const banners = buildBannerModel([
      { step: 'dependencies', status: 'succeeded', message: 'done', remediation: null },
    ]);

    expect(banners).toHaveLength(0);
  });
});

describe('statusToDotClass', () => {
  it('maps each observable status to a distinct dot class', () => {
    expect(statusToDotClass('pending')).toContain('pending');
    expect(statusToDotClass('in_progress')).toContain('in-progress');
    expect(statusToDotClass('succeeded')).toContain('succeeded');
    expect(statusToDotClass('skipped')).toContain('skipped');
    expect(statusToDotClass('blocked')).toContain('blocked');
    expect(statusToDotClass('warning')).toContain('warning');
    expect(statusToDotClass('awaiting_input')).toContain('awaiting-input');
  });
});

describe('statusToLabel', () => {
  it('returns an uppercase human label for a status', () => {
    expect(statusToLabel('in_progress')).toBe('IN PROGRESS');
    expect(statusToLabel('succeeded')).toBe('SUCCEEDED');
    expect(statusToLabel('blocked')).toBe('BLOCKED');
  });
});

describe('buildAriaAnnouncement', () => {
  it('announces step position and status for screen readers', () => {
    const announcement = buildAriaAnnouncement({
      id: 'claude-login',
      label: 'Claude login',
      status: 'succeeded',
      message: null,
      remediation: null,
      position: 2,
      total: 10,
    });

    expect(announcement).toContain('2');
    expect(announcement).toContain('10');
    expect(announcement.toLowerCase()).toContain('succeeded');
  });
});

describe('renderStepRow', () => {
  it('emits the // LABEL prefix and a status dot with the mapped class', () => {
    const html = renderStepRow({
      id: 'dependencies',
      label: 'Dependencies',
      status: 'in_progress',
      message: 'Checking',
      remediation: null,
      position: 1,
      total: 10,
    });

    expect(html).toContain('// DEPENDENCIES');
    expect(html).toContain('setup-step-dot--in-progress');
    expect(html).toContain('data-step-id="dependencies"');
  });

  it('escapes the remediation message to avoid injection', () => {
    const html = renderStepRow({
      id: 'pipeline',
      label: 'Pipeline',
      status: 'blocked',
      message: 'broken',
      remediation: '<img src=x onerror=alert(1)>',
      position: 6,
      total: 10,
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
