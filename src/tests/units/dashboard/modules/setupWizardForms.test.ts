import { describe, it, expect } from 'vitest';

import {
  buildFormModel,
  renderForm,
  buildInputPayload,
} from '@/dashboard/modules/setupWizardForms.js';

describe('buildFormModel', () => {
  it('extracts the view model from a text awaiting_input event', () => {
    const model = buildFormModel({
      step: 'add-project',
      status: 'awaiting_input',
      prompt: 'Chemin du projet ?',
      kind: 'text',
      options: [],
      defaultValue: '/home/u/cwd',
    });

    expect(model).toEqual({
      stepId: 'add-project',
      kind: 'text',
      prompt: 'Chemin du projet ?',
      options: [],
      defaultValue: '/home/u/cwd',
    });
  });

  it('extracts the offered options from a choice event', () => {
    const model = buildFormModel({
      step: 'pipeline',
      status: 'awaiting_input',
      prompt: 'Preset ?',
      kind: 'choice',
      options: [
        { label: 'Backend', value: 'backend' },
        { label: 'Frontend', value: 'frontend' },
      ],
      defaultValue: null,
    });

    expect(model?.kind).toBe('choice');
    expect(model?.options).toEqual([
      { label: 'Backend', value: 'backend' },
      { label: 'Frontend', value: 'frontend' },
    ]);
  });

  it('returns null when the event is not an awaiting_input event', () => {
    const model = buildFormModel({
      step: 'dependencies',
      status: 'in_progress',
      message: 'Checking',
    });

    expect(model).toBeNull();
  });

  it('returns null when the event is null', () => {
    expect(buildFormModel(null)).toBeNull();
  });

  it('defaults options to an empty list and defaultValue to null when absent', () => {
    const model = buildFormModel({
      step: 'secrets',
      status: 'awaiting_input',
      prompt: 'Rotation requise ?',
      kind: 'confirm',
    });

    expect(model?.options).toEqual([]);
    expect(model?.defaultValue).toBeNull();
  });
});

describe('renderForm', () => {
  it('renders a text input using the default value as placeholder plus a submit', () => {
    const html = renderForm({
      stepId: 'add-project',
      kind: 'text',
      prompt: 'Chemin du projet ?',
      options: [],
      defaultValue: '/home/u/cwd',
    });

    expect(html).toContain('<input');
    expect(html).toContain('type="text"');
    expect(html).toContain('placeholder="/home/u/cwd"');
    expect(html).toContain('// CHEMIN DU PROJET ?'.toUpperCase());
    expect(html).toContain('type="submit"');
  });

  it('renders confirm and cancel controls for a confirm prompt', () => {
    const html = renderForm({
      stepId: 'secrets',
      kind: 'confirm',
      prompt: 'Rotation requise ?',
      options: [],
      defaultValue: null,
    });

    expect(html).toContain('data-confirm-value="true"');
    expect(html).toContain('data-confirm-value="false"');
    expect(html).toContain('Confirmer');
    expect(html).toContain('Annuler');
  });

  it('renders a selectable list of options for a choice prompt', () => {
    const html = renderForm({
      stepId: 'pipeline',
      kind: 'choice',
      prompt: 'Preset ?',
      options: [
        { label: 'Backend', value: 'backend' },
        { label: 'Frontend', value: 'frontend' },
      ],
      defaultValue: null,
    });

    expect(html).toContain('Backend');
    expect(html).toContain('Frontend');
    expect(html).toContain('data-choice-value="backend"');
    expect(html).toContain('data-choice-value="frontend"');
  });

  it('renders checkboxes plus a submit for a multiSelect prompt', () => {
    const html = renderForm({
      stepId: 'pipeline',
      kind: 'multiSelect',
      prompt: 'Agents ?',
      options: [
        { label: 'SOLID', value: 'solid' },
        { label: 'Testing', value: 'testing' },
      ],
      defaultValue: null,
    });

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('value="solid"');
    expect(html).toContain('value="testing"');
    expect(html).toContain('SOLID');
    expect(html).toContain('type="submit"');
  });

  it('carries the // LABEL prefix and corner brackets consistent with step rows', () => {
    const html = renderForm({
      stepId: 'add-project',
      kind: 'text',
      prompt: 'Chemin du projet ?',
      options: [],
      defaultValue: null,
    });

    expect(html).toContain('// ');
    expect(html).toContain('setup-corner--tl');
    expect(html).toContain('setup-corner--br');
  });

  it('escapes the prompt and option labels to avoid injection', () => {
    const html = renderForm({
      stepId: 'pipeline',
      kind: 'choice',
      prompt: '<img src=x onerror=alert(1)>',
      options: [{ label: '<script>bad()</script>', value: 'evil' }],
      defaultValue: null,
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>bad()');
    expect(html.toLowerCase()).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns an empty string when the model is null', () => {
    expect(renderForm(null)).toBe('');
  });
});

describe('buildInputPayload', () => {
  it('builds a text payload with the raw string value', () => {
    const payload = buildInputPayload('text', 'run-1', '/home/u/api', []);

    expect(payload).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'text', value: '/home/u/api' },
    });
  });

  it('coerces a confirm value to a boolean', () => {
    expect(buildInputPayload('confirm', 'run-1', true, [])).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'confirm', value: true },
    });
    expect(buildInputPayload('confirm', 'run-1', false, [])).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'confirm', value: false },
    });
  });

  it('builds a choice payload when the value is among the offered options', () => {
    const payload = buildInputPayload('choice', 'run-1', 'backend', [
      { label: 'Backend', value: 'backend' },
      { label: 'Frontend', value: 'frontend' },
    ]);

    expect(payload).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'choice', value: 'backend' },
    });
  });

  it('surfaces an invalid choice that is not among the offered options', () => {
    const payload = buildInputPayload('choice', 'run-1', 'database', [
      { label: 'Backend', value: 'backend' },
    ]);

    expect(payload.ok).toBe(false);
    expect(payload).toHaveProperty('error');
  });

  it('builds a multiSelect payload when every value is among the offered options', () => {
    const payload = buildInputPayload(
      'multiSelect',
      'run-1',
      ['solid', 'testing'],
      [
        { label: 'SOLID', value: 'solid' },
        { label: 'Testing', value: 'testing' },
      ],
    );

    expect(payload).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'multiSelect', value: ['solid', 'testing'] },
    });
  });

  it('surfaces an invalid multiSelect when any value is not offered', () => {
    const payload = buildInputPayload(
      'multiSelect',
      'run-1',
      ['solid', 'ghost'],
      [{ label: 'SOLID', value: 'solid' }],
    );

    expect(payload.ok).toBe(false);
    expect(payload).toHaveProperty('error');
  });

  it('accepts an empty multiSelect selection', () => {
    const payload = buildInputPayload(
      'multiSelect',
      'run-1',
      [],
      [{ label: 'SOLID', value: 'solid' }],
    );

    expect(payload).toEqual({
      ok: true,
      body: { runId: 'run-1', kind: 'multiSelect', value: [] },
    });
  });

  it('surfaces an invalid confirm value that is not a boolean', () => {
    const payload = buildInputPayload('confirm', 'run-1', 'yes', []);

    expect(payload.ok).toBe(false);
    expect(payload).toHaveProperty('error');
  });
});
