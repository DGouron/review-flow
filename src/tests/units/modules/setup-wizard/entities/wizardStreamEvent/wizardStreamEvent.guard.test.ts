import { describe, it, expect } from 'vitest';

import { wizardStreamEventGuard } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.js';

describe('wizardStreamEventGuard', () => {
  it('accepts a step-started event', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'dependencies',
      status: 'in_progress',
      message: 'Checking dependencies',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a step-completed event with remediation', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'pipeline',
      status: 'blocked',
      message: 'No git remote',
      remediation: 'Run git remote add origin',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a self-describing awaiting-input event with kind, options and defaultValue', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'add-project',
      status: 'awaiting_input',
      prompt: 'Chemin du projet ?',
      kind: 'text',
      options: [],
      defaultValue: '/home/u/api',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a choice awaiting-input event carrying its options', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'pipeline',
      status: 'awaiting_input',
      prompt: 'Preset ?',
      kind: 'choice',
      options: [{ label: 'Backend', value: 'backend' }],
      defaultValue: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an awaiting-input event with an unknown kind', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'add-project',
      status: 'awaiting_input',
      prompt: 'Chemin du projet ?',
      kind: 'slider',
      options: [],
      defaultValue: null,
    });

    expect(result.success).toBe(false);
  });

  it('accepts an instructions banner event', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'instructions',
      status: 'info',
      lines: ['Run claude login', 'Then retry'],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a warning banner event', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'warning',
      status: 'warning',
      message: 'Daemon already running',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a resume banner event', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'resume',
      status: 'resumed',
      resumeAt: 'secrets',
      position: 4,
      total: 10,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a done banner event', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'done',
      status: 'completed',
      summary: { project: 'owner/repo' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an event with an unknown step id', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'not-a-real-step',
      status: 'succeeded',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an event with an unknown status', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'daemon',
      status: 'exploded',
    });

    expect(result.success).toBe(false);
  });

  it('distinguishes a completion event whose status is warning from the warning banner', () => {
    const result = wizardStreamEventGuard.safeParse({
      step: 'daemon',
      status: 'warning',
      message: 'Daemon restarted',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('daemon');
    }
  });
});
