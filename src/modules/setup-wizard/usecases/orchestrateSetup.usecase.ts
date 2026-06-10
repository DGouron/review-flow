import {
  AwaitingInputClosedError,
  NonInteractiveInputError,
} from '@/modules/setup-wizard/entities/promptInputError/promptInputError.js';
import {
  createInitialState,
  markStep,
  findFirstIncomplete,
} from '@/modules/setup-wizard/entities/setupState/setupState.js';
import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import {
  isFinalSuccess,
  isBlocking,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

export interface OrchestrateSetupInput {
  context: WizardContext;
  steps: SetupStep[];
}

export interface OrchestrateSetupResult {
  finalState: SetupState;
  exitCode: 0 | 1 | 2;
  resumedFromStepId: StepId | null;
  stateWasCorrupted: boolean;
}

export class OrchestrateSetupUseCase {
  private async runStep(step: SetupStep, context: WizardContext): Promise<StepOutcome> {
    try {
      return await step.execute(context);
    } catch (error) {
      if (error instanceof AwaitingInputClosedError) {
        return blocked(error.message, 'Fournissez une réponse sur stdin ou relancez sans --json');
      }
      if (error instanceof NonInteractiveInputError) {
        return blocked(error.message, 'Relancez sans -y pour répondre interactivement');
      }
      throw error;
    }
  }

  async execute(input: OrchestrateSetupInput): Promise<OrchestrateSetupResult> {
    const { context, steps } = input;
    const loadResult = context.gateways.setupState.load();
    const stateWasCorrupted = loadResult.corrupted;
    if (loadResult.corrupted) {
      context.emitter.emitWarning("Fichier d'état corrompu, démarrage à zéro");
    }

    let state: SetupState = loadResult.state ?? createInitialState(context.now);
    context.state = state;

    const stepIds = steps.map((step) => step.id);
    const firstIncomplete = findFirstIncomplete(state, stepIds);
    const resumedFromStepId =
      firstIncomplete !== null && Object.keys(state.steps).length > 0 ? firstIncomplete : null;
    if (resumedFromStepId !== null) {
      const position = stepIds.indexOf(resumedFromStepId) + 1;
      context.emitter.emitResumeBanner(resumedFromStepId, position, steps.length);
    }

    let exitCode: 0 | 1 | 2 = 0;
    let counterBlocked = 0;

    for (const step of steps) {
      const existing = state.steps[step.id];
      if (existing && isFinalSuccess(existing)) {
        const detected = await step.detect(context);
        if (detected && isFinalSuccess(detected)) {
          state = markStep(state, step.id, detected, context.now);
          context.state = state;
          context.gateways.setupState.save(state);
          continue;
        }
      }

      context.currentStepId = step.id;
      context.emitter.emitStepStarted(step.id, step.title);
      const detected = await step.detect(context);
      let outcome: StepOutcome;
      if (detected && isFinalSuccess(detected)) {
        outcome = detected;
      } else if (detected && isBlocking(detected)) {
        outcome = detected;
      } else {
        outcome = await this.runStep(step, context);
      }
      context.emitter.emitStepCompleted(step.id, outcome);
      state = markStep(state, step.id, outcome, context.now);
      if (context.state && context.project) {
        state = { ...state, project: context.project };
      }
      context.state = state;
      context.gateways.setupState.save(state);

      if (isBlocking(outcome)) {
        counterBlocked++;
        if (context.flags.yes) {
          exitCode = 2;
        } else {
          exitCode = 1;
        }
        break;
      }
    }

    context.emitter.emitDone({
      totalSteps: steps.length,
      blocked: counterBlocked,
      project: context.project,
    });

    return {
      finalState: state,
      exitCode,
      resumedFromStepId,
      stateWasCorrupted,
    };
  }
}
