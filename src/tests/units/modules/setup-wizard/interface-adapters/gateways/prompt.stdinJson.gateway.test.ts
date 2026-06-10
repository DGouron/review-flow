import { describe, it, expect } from 'vitest';

import {
  AwaitingInputClosedError,
  NonInteractiveInputError,
} from '@/modules/setup-wizard/entities/promptInputError/promptInputError.js';
import type {
  PromptKind,
  PromptOption,
} from '@/modules/setup-wizard/entities/promptOption/promptOption.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import { PromptStdinJsonGateway } from '@/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';
import { StubLineReader } from '@/tests/stubs/setup-wizard/lineReader.stub.js';

interface AwaitingEvent {
  stepId: StepId;
  prompt: string;
  kind: PromptKind;
  options: PromptOption[];
  defaultValue: string | null;
}

class RecordingEmitter implements WizardEventEmitter {
  public awaiting: AwaitingEvent[] = [];
  public warnings: string[] = [];

  emitStepStarted(): void {}
  emitStepCompleted(_stepId: StepId, _outcome: StepOutcome): void {}
  emitAwaitingInput(
    stepId: StepId,
    prompt: string,
    kind: PromptKind,
    options: PromptOption[],
    defaultValue: string | null,
  ): void {
    this.awaiting.push({ stepId, prompt, kind, options, defaultValue });
  }
  emitInstructions(): void {}
  emitWarning(message: string): void {
    this.warnings.push(message);
  }
  emitResumeBanner(): void {}
  emitDone(): void {}
}

interface BuildOptions {
  lines: string[];
  emitter?: RecordingEmitter;
  nonInteractive?: boolean;
  stepId?: StepId;
}

function build(options: BuildOptions): {
  gateway: PromptStdinJsonGateway;
  emitter: RecordingEmitter;
} {
  const emitter = options.emitter ?? new RecordingEmitter();
  const gateway = new PromptStdinJsonGateway({
    lineReader: new StubLineReader(options.lines),
    emitter,
    currentStepId: () => options.stepId ?? 'add-project',
    isNonInteractive: () => options.nonInteractive ?? false,
  });
  return { gateway, emitter };
}

describe('PromptStdinJsonGateway', () => {
  describe('askText', () => {
    it('returns the raw line as the value', async () => {
      const { gateway } = build({ lines: ['/home/u/api'] });

      const value = await gateway.askText('Project path?');

      expect(value).toBe('/home/u/api');
    });

    it('announces awaiting_input before reading', async () => {
      const { gateway, emitter } = build({ lines: ['/home/u/api'], stepId: 'add-project' });

      await gateway.askText('Project path?');

      expect(emitter.awaiting).toEqual([
        {
          stepId: 'add-project',
          prompt: 'Project path?',
          kind: 'text',
          options: [],
          defaultValue: null,
        },
      ]);
    });

    it('forwards the text default value as the awaiting_input defaultValue', async () => {
      const { gateway, emitter } = build({ lines: ['/home/u/api'] });

      await gateway.askText('Project path?', '/home/u/default');

      expect(emitter.awaiting[0].kind).toBe('text');
      expect(emitter.awaiting[0].defaultValue).toBe('/home/u/default');
    });

    it('uses the default value when the line is empty', async () => {
      const { gateway } = build({ lines: [''] });

      const value = await gateway.askText('Project path?', '/home/u/api');

      expect(value).toBe('/home/u/api');
    });

    it('throws AwaitingInputClosedError when the stream closes before an answer', async () => {
      const { gateway } = build({ lines: [] });

      await expect(gateway.askText('Project path?')).rejects.toBeInstanceOf(
        AwaitingInputClosedError,
      );
    });

    it('throws NonInteractiveInputError when constructed for non-interactive mode', async () => {
      const { gateway } = build({ lines: ['/home/u/api'], nonInteractive: true });

      await expect(gateway.askText('Project path?')).rejects.toBeInstanceOf(
        NonInteractiveInputError,
      );
    });
  });

  describe('askConfirm', () => {
    it('returns true for the line "true"', async () => {
      const { gateway } = build({ lines: ['true'] });

      expect(await gateway.askConfirm('Continue?')).toBe(true);
    });

    it('returns false for the line "false"', async () => {
      const { gateway } = build({ lines: ['false'] });

      expect(await gateway.askConfirm('Continue?')).toBe(false);
    });

    it('announces a confirm prompt with no options and no default', async () => {
      const { gateway, emitter } = build({ lines: ['true'] });

      await gateway.askConfirm('Continue?');

      expect(emitter.awaiting[0].kind).toBe('confirm');
      expect(emitter.awaiting[0].options).toEqual([]);
      expect(emitter.awaiting[0].defaultValue).toBeNull();
    });

    it('refuses a wrong-shape answer, re-announces, then accepts the next valid line', async () => {
      const { gateway, emitter } = build({ lines: ['"maybe"', 'true'] });

      const value = await gateway.askConfirm('Continue?');

      expect(value).toBe(true);
      expect(emitter.warnings).toContain('Réponse invalide');
      expect(emitter.awaiting).toHaveLength(2);
    });
  });

  describe('askChoice', () => {
    const choices = [
      { label: 'Backend', value: 'backend' },
      { label: 'Frontend', value: 'frontend' },
    ];

    it('returns the chosen value when it is offered', async () => {
      const { gateway } = build({ lines: ['"backend"'] });

      expect(await gateway.askChoice('Preset?', choices)).toBe('backend');
    });

    it('announces a choice prompt carrying its offered options', async () => {
      const { gateway, emitter } = build({ lines: ['"backend"'] });

      await gateway.askChoice('Preset?', choices);

      expect(emitter.awaiting[0].kind).toBe('choice');
      expect(emitter.awaiting[0].options).toEqual(choices);
      expect(emitter.awaiting[0].defaultValue).toBeNull();
    });

    it('refuses an unoffered choice, re-announces, then accepts the next valid line', async () => {
      const { gateway, emitter } = build({ lines: ['"mobile"', '"frontend"'] });

      const value = await gateway.askChoice('Preset?', choices);

      expect(value).toBe('frontend');
      expect(emitter.warnings).toContain('Choix invalide, sélectionnez une option proposée');
      expect(emitter.awaiting).toHaveLength(2);
    });

    it('refuses a non-string answer with the generic invalid message', async () => {
      const { gateway, emitter } = build({ lines: ['42', '"backend"'] });

      const value = await gateway.askChoice('Preset?', choices);

      expect(value).toBe('backend');
      expect(emitter.warnings).toContain('Réponse invalide');
    });
  });

  describe('askMultiSelect', () => {
    const choices = [
      { label: 'SOLID', value: 'solid' },
      { label: 'Testing', value: 'testing' },
      { label: 'Security', value: 'security' },
    ];

    it('returns the selected values when all are offered', async () => {
      const { gateway } = build({ lines: ['["solid","testing"]'] });

      expect(await gateway.askMultiSelect('Skills?', choices)).toEqual(['solid', 'testing']);
    });

    it('announces a multi-select prompt carrying its offered options', async () => {
      const { gateway, emitter } = build({ lines: ['["solid"]'] });

      await gateway.askMultiSelect('Skills?', choices);

      expect(emitter.awaiting[0].kind).toBe('multiSelect');
      expect(emitter.awaiting[0].options).toEqual(choices);
      expect(emitter.awaiting[0].defaultValue).toBeNull();
    });

    it('refuses a selection with an unknown value, re-announces, then accepts the next valid line', async () => {
      const { gateway, emitter } = build({ lines: ['["solid","mobile"]', '["solid"]'] });

      const value = await gateway.askMultiSelect('Skills?', choices);

      expect(value).toEqual(['solid']);
      expect(emitter.warnings).toContain("Sélection invalide, une valeur n'est pas proposée");
      expect(emitter.awaiting).toHaveLength(2);
    });

    it('refuses a wrong-shape answer with the generic invalid message', async () => {
      const { gateway, emitter } = build({ lines: ['"solid"', '["solid"]'] });

      const value = await gateway.askMultiSelect('Skills?', choices);

      expect(value).toEqual(['solid']);
      expect(emitter.warnings).toContain('Réponse invalide');
    });
  });

  describe('malformed input', () => {
    it('refuses an unparseable line, re-announces, then accepts the next valid line', async () => {
      const { gateway, emitter } = build({ lines: ['{not json', 'true'] });

      const value = await gateway.askConfirm('Continue?');

      expect(value).toBe(true);
      expect(emitter.warnings).toContain('Réponse illisible');
      expect(emitter.awaiting).toHaveLength(2);
    });
  });
});
