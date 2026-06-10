import type {
  PromptKind,
  PromptOption,
} from '@/modules/setup-wizard/entities/promptOption/promptOption.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcomeStatus } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

interface StepStartedOverrides {
  step?: StepId;
  message?: string;
}

interface StepCompletedOverrides {
  step?: StepId;
  status?: StepOutcomeStatus;
  message?: string | null;
  remediation?: string | null;
}

interface AwaitingInputOverrides {
  step?: StepId;
  prompt?: string;
  kind?: PromptKind;
  options?: PromptOption[];
  defaultValue?: string | null;
}

interface ResumeOverrides {
  resumeAt?: StepId;
  position?: number;
  total?: number;
}

interface DoneOverrides {
  summary?: Record<string, unknown>;
}

export class WizardStreamEventFactory {
  static stepStarted(overrides: StepStartedOverrides = {}): string {
    return JSON.stringify({
      step: overrides.step ?? 'dependencies',
      status: 'in_progress',
      message: overrides.message ?? 'Step in progress',
    });
  }

  static stepCompleted(overrides: StepCompletedOverrides = {}): string {
    return JSON.stringify({
      step: overrides.step ?? 'dependencies',
      status: overrides.status ?? 'succeeded',
      message: overrides.message ?? 'Step completed',
      remediation: overrides.remediation ?? null,
    });
  }

  static awaitingInput(overrides: AwaitingInputOverrides = {}): string {
    return JSON.stringify({
      step: overrides.step ?? 'add-project',
      status: 'awaiting_input',
      prompt: overrides.prompt ?? 'Chemin du projet ?',
      kind: overrides.kind ?? 'text',
      options: overrides.options ?? [],
      defaultValue: overrides.defaultValue ?? null,
    });
  }

  static instructions(lines: string[] = ['Run claude login']): string {
    return JSON.stringify({ step: 'instructions', status: 'info', lines });
  }

  static warning(message = 'Daemon already running'): string {
    return JSON.stringify({ step: 'warning', status: 'warning', message });
  }

  static resume(overrides: ResumeOverrides = {}): string {
    return JSON.stringify({
      step: 'resume',
      status: 'resumed',
      resumeAt: overrides.resumeAt ?? 'add-project',
      position: overrides.position ?? 5,
      total: overrides.total ?? 10,
    });
  }

  static done(overrides: DoneOverrides = {}): string {
    return JSON.stringify({
      step: 'done',
      status: 'completed',
      summary: overrides.summary ?? { project: 'owner/repo' },
    });
  }
}
