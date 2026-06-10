import { describe, it, expect } from 'vitest';

import { avatarStateFromEvents, shouldUseAvatar } from '@/dashboard/modules/setupWizardAvatar.js';
import { wizardStreamEventGuard } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.js';
import { WizardStreamEventFactory } from '@/tests/factories/wizardStreamEvent.factory.js';

function validEventsFrom(lines: string[]): Record<string, unknown>[] {
  const parsed = lines.map((line) => JSON.parse(line));
  return wizardStreamEventGuard.filterCollection(parsed).valid;
}

describe('Setup Wizard wireframe avatar (acceptance, SPEC-188 Phase 1)', () => {
  describe('the avatar state tracks the scripted event stream', () => {
    it('drives the core through idle → working → success → … → celebrating', () => {
      const scriptedStates: string[] = [];

      const timeline: string[][] = [
        [],
        [WizardStreamEventFactory.stepStarted({ step: 'dependencies' })],
        [
          WizardStreamEventFactory.stepStarted({ step: 'dependencies' }),
          WizardStreamEventFactory.stepCompleted({ step: 'dependencies', status: 'succeeded' }),
        ],
        [
          WizardStreamEventFactory.stepStarted({ step: 'claude-login' }),
          WizardStreamEventFactory.stepCompleted({ step: 'claude-login', status: 'skipped' }),
        ],
        [
          WizardStreamEventFactory.stepStarted({ step: 'pipeline' }),
          WizardStreamEventFactory.stepCompleted({
            step: 'pipeline',
            status: 'blocked',
            message: 'Aucun remote git',
            remediation: 'Ajoutez un remote git',
          }),
        ],
        [
          WizardStreamEventFactory.awaitingInput({
            step: 'add-project',
            kind: 'choice',
            options: [{ label: 'GitHub', value: 'github' }],
          }),
        ],
        [WizardStreamEventFactory.warning('Daemon already running')],
        [WizardStreamEventFactory.done()],
      ];

      for (const lines of timeline) {
        scriptedStates.push(avatarStateFromEvents(validEventsFrom(lines)));
      }

      expect(scriptedStates).toEqual([
        'idle',
        'working',
        'success',
        'success',
        'error',
        'listening',
        'working',
        'celebrating',
      ]);
    });

    it('keeps the blocked remediation message available verbatim for the error state', () => {
      const events = validEventsFrom([
        WizardStreamEventFactory.stepCompleted({
          step: 'pipeline',
          status: 'blocked',
          message: 'Aucun remote git',
          remediation: 'Ajoutez un remote git puis relancez',
        }),
      ]);

      expect(avatarStateFromEvents(events)).toBe('error');
      const blocked = events.find((event) => event.status === 'blocked');
      expect(blocked?.remediation).toBe('Ajoutez un remote git puis relancez');
    });
  });

  describe('the avatar is only used when canvas is available and motion is allowed', () => {
    it('uses the avatar when canvas is supported and reduced motion is off', () => {
      expect(shouldUseAvatar({ canvasSupported: true, reducedMotion: false })).toBe(true);
    });

    it('falls back when reduced motion is preferred', () => {
      expect(shouldUseAvatar({ canvasSupported: true, reducedMotion: true })).toBe(false);
    });

    it('falls back when canvas is not supported', () => {
      expect(shouldUseAvatar({ canvasSupported: false, reducedMotion: false })).toBe(false);
    });
  });
});
