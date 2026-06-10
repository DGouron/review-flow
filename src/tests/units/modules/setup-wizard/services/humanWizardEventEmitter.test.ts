import { describe, it, expect } from 'vitest';

import {
  succeeded,
  skipped,
  warning,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';

function capture(): { lines: string[]; emitter: HumanWizardEventEmitter } {
  const lines: string[] = [];
  const emitter = new HumanWizardEventEmitter((line) => lines.push(line));
  return { lines, emitter };
}

describe('HumanWizardEventEmitter', () => {
  it('writes the step title on start', () => {
    const { lines, emitter } = capture();
    emitter.emitStepStarted('dependencies', 'Vérification des dépendances');
    expect(lines.join('\n')).toContain('Vérification des dépendances');
  });

  it('writes the message on a succeeded outcome', () => {
    const { lines, emitter } = capture();
    emitter.emitStepCompleted('daemon', succeeded('Daemon installé et actif'));
    expect(lines.join('\n')).toContain('Daemon installé et actif');
  });

  it('writes the message on a skipped outcome', () => {
    const { lines, emitter } = capture();
    emitter.emitStepCompleted('daemon', skipped('Daemon déjà actif'));
    expect(lines.join('\n')).toContain('Daemon déjà actif');
  });

  it('writes the message on a warning outcome', () => {
    const { lines, emitter } = capture();
    emitter.emitStepCompleted('daemon', warning('Plateforme non supportée'));
    expect(lines.join('\n')).toContain('Plateforme non supportée');
  });

  it('writes the message and the remediation on a blocked outcome', () => {
    const { lines, emitter } = capture();
    emitter.emitStepCompleted(
      'claude-login',
      blocked("L'authentification a échoué", 'Relancez claude /login'),
    );
    const output = lines.join('\n');
    expect(output).toContain("L'authentification a échoué");
    expect(output).toContain('Relancez claude /login');
  });

  it('writes one line per instruction', () => {
    const { lines, emitter } = capture();
    emitter.emitInstructions([
      'Configurez le webhook sur github:',
      '  URL=http://host:3847/webhooks/github',
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('/webhooks/github');
  });

  it('writes the resume banner with position and total', () => {
    const { lines, emitter } = capture();
    emitter.emitResumeBanner('pipeline', 6, 10);
    expect(lines.join('\n')).toContain('6/10');
  });

  it('writes a warning message', () => {
    const { lines, emitter } = capture();
    emitter.emitWarning('Daemon injoignable');
    expect(lines.join('\n')).toContain('Daemon injoignable');
  });

  it('writes a completion line on done', () => {
    const { lines, emitter } = capture();
    emitter.emitDone({ totalSteps: 10, blocked: 0 });
    expect(lines.join('\n')).toContain('Setup terminé');
  });
});
