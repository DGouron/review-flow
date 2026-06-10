import type {
  PromptKind,
  PromptOption,
} from '@/modules/setup-wizard/entities/promptOption/promptOption.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';
import { green, red, yellow, dim, bold } from '@/shared/services/ansiColors.js';

type Logger = (line: string) => void;

export class HumanWizardEventEmitter implements WizardEventEmitter {
  constructor(private readonly write: Logger) {}

  emitStepStarted(_stepId: StepId, title: string): void {
    this.write(`${bold('→')} ${title}`);
  }

  emitStepCompleted(_stepId: StepId, outcome: StepOutcome): void {
    if (outcome.status === 'succeeded') {
      this.write(`  ${green('✓')} ${outcome.message ?? 'succeeded'}`);
      return;
    }
    if (outcome.status === 'skipped') {
      this.write(`  ${dim('•')} ${outcome.message ?? 'skipped'}`);
      return;
    }
    if (outcome.status === 'warning') {
      this.write(`  ${yellow('!')} ${outcome.message ?? 'warning'}`);
      return;
    }
    this.write(`  ${red('✗')} ${outcome.message ?? 'blocked'}`);
    if (outcome.remediation) {
      this.write(`    ${dim('→')} ${outcome.remediation}`);
    }
  }

  emitAwaitingInput(
    _stepId: StepId,
    prompt: string,
    _kind: PromptKind,
    _options: PromptOption[],
    _defaultValue: string | null,
  ): void {
    this.write(`  ${dim('?')} ${prompt}`);
  }

  emitInstructions(lines: string[]): void {
    for (const line of lines) {
      this.write(line);
    }
  }

  emitWarning(message: string): void {
    this.write(`${yellow('⚠')}  ${message}`);
  }

  emitResumeBanner(_stepId: StepId, position: number, total: number): void {
    this.write(dim(`Reprise du setup à l'étape ${position}/${total}`));
  }

  emitDone(summary: Record<string, unknown>): void {
    this.write(green(bold(`Setup terminé. ${JSON.stringify(summary)}`)));
  }
}
