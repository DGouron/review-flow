import { describe, it, expect } from 'vitest';

import { succeeded, blocked } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import { JsonWizardEventEmitter } from '@/modules/setup-wizard/services/jsonWizardEventEmitter.js';

describe('JsonWizardEventEmitter', () => {
  it('emits one JSON line per step start', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitStepStarted('dependencies', 'Check dependencies');
    expect(lines).toHaveLength(1);
    const event: { step: string; status: string } = JSON.parse(lines[0]);
    expect(event.step).toBe('dependencies');
    expect(event.status).toBe('in_progress');
  });

  it('emits awaiting_input event with prompt text', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitAwaitingInput('add-project', 'Chemin du projet ?', 'text', [], null);
    const event: { step: string; status: string; prompt: string } = JSON.parse(lines[0]);
    expect(event.status).toBe('awaiting_input');
    expect(event.prompt).toBe('Chemin du projet ?');
  });

  it('emits a self-describing awaiting_input event with kind, options and defaultValue', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitAwaitingInput(
      'pipeline',
      'Preset ?',
      'choice',
      [{ label: 'Backend', value: 'backend' }],
      null,
    );
    const event: {
      kind: string;
      options: { label: string; value: string }[];
      defaultValue: string | null;
    } = JSON.parse(lines[0]);
    expect(event.kind).toBe('choice');
    expect(event.options).toEqual([{ label: 'Backend', value: 'backend' }]);
    expect(event.defaultValue).toBeNull();
  });

  it('carries the text default value so the form can use it as a placeholder', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitAwaitingInput('add-project', 'Chemin ?', 'text', [], '/home/u/api');
    const event: { defaultValue: string | null } = JSON.parse(lines[0]);
    expect(event.defaultValue).toBe('/home/u/api');
  });

  it('emits step status from outcome', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitStepCompleted('claude-login', succeeded('done'));
    const event: { step: string; status: string; message: string } = JSON.parse(lines[0]);
    expect(event.step).toBe('claude-login');
    expect(event.status).toBe('succeeded');
    expect(event.message).toBe('done');
  });

  it('emits blocked event with remediation', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitStepCompleted('claude-login', blocked('Failed', 'Run claude /login'));
    const event: { status: string; remediation: string } = JSON.parse(lines[0]);
    expect(event.status).toBe('blocked');
    expect(event.remediation).toBe('Run claude /login');
  });

  it('emits a done summary at the end', () => {
    const lines: string[] = [];
    const emitter = new JsonWizardEventEmitter((line) => lines.push(line));
    emitter.emitDone({ totalSteps: 10, blocked: 0 });
    const event: { step: string; status: string; summary: { totalSteps: number } } = JSON.parse(
      lines[0],
    );
    expect(event.step).toBe('done');
    expect(event.status).toBe('completed');
    expect(event.summary.totalSteps).toBe(10);
  });
});
