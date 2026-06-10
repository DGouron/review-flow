import type {
  PromptKind,
  PromptOption,
} from '@/modules/setup-wizard/entities/promptOption/promptOption.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';

type LineWriter = (line: string) => void;

export class JsonWizardEventEmitter implements WizardEventEmitter {
  constructor(private readonly write: LineWriter) {}

  private emit(event: Record<string, unknown>): void {
    this.write(JSON.stringify(event));
  }

  emitStepStarted(stepId: StepId, title: string): void {
    this.emit({ step: stepId, status: 'in_progress', message: title });
  }

  emitStepCompleted(stepId: StepId, outcome: StepOutcome): void {
    this.emit({
      step: stepId,
      status: outcome.status,
      message: outcome.message,
      remediation: outcome.remediation,
    });
  }

  emitAwaitingInput(
    stepId: StepId,
    prompt: string,
    kind: PromptKind,
    options: PromptOption[],
    defaultValue: string | null,
  ): void {
    this.emit({ step: stepId, status: 'awaiting_input', prompt, kind, options, defaultValue });
  }

  emitInstructions(lines: string[]): void {
    this.emit({ step: 'instructions', status: 'info', lines });
  }

  emitWarning(message: string): void {
    this.emit({ step: 'warning', status: 'warning', message });
  }

  emitResumeBanner(stepId: StepId, position: number, total: number): void {
    this.emit({ step: 'resume', status: 'resumed', resumeAt: stepId, position, total });
  }

  emitDone(summary: Record<string, unknown>): void {
    this.emit({ step: 'done', status: 'completed', summary });
  }
}
