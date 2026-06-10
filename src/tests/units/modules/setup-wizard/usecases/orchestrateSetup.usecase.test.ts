import { describe, it, expect } from 'vitest';

import {
  AwaitingInputClosedError,
  NonInteractiveInputError,
} from '@/modules/setup-wizard/entities/promptInputError/promptInputError.js';
import type {
  SetupStateGateway,
  SetupStateLoadResult,
} from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { succeeded, blocked } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';
import { OrchestrateSetupUseCase } from '@/modules/setup-wizard/usecases/orchestrateSetup.usecase.js';
import { SetupStateFactory } from '@/tests/factories/setupState.factory.js';
import { StubAiFallbackGateway } from '@/tests/stubs/setup-wizard/aiFallback.stub.js';
import { StubClaudeAuthGateway } from '@/tests/stubs/setup-wizard/claudeAuth.stub.js';
import { StubDaemonHealthProbeGateway } from '@/tests/stubs/setup-wizard/daemonHealthProbe.stub.js';
import { StubDaemonServiceGateway } from '@/tests/stubs/setup-wizard/daemonService.stub.js';
import { StubDependencyProbeGateway } from '@/tests/stubs/setup-wizard/dependencyProbe.stub.js';
import { StubEnvFileGateway } from '@/tests/stubs/setup-wizard/envFile.stub.js';
import { StubGitRemoteGateway } from '@/tests/stubs/setup-wizard/gitRemote.stub.js';
import { StubProjectConfigGateway } from '@/tests/stubs/setup-wizard/projectConfig.stub.js';
import { StubPromptGateway } from '@/tests/stubs/setup-wizard/prompt.stub.js';
import { StubServerConfigGateway } from '@/tests/stubs/setup-wizard/serverConfig.stub.js';
import { StubSkillTemplateGateway } from '@/tests/stubs/setup-wizard/skillTemplate.stub.js';
import { StubValidationGateway } from '@/tests/stubs/setup-wizard/validation.stub.js';

class FakeStep implements SetupStep {
  public detectCalls = 0;
  public executeCalls = 0;

  constructor(
    public readonly id: StepId,
    public readonly title: string,
    private readonly detectResult: StepOutcome | null,
    private readonly executeResult: StepOutcome,
  ) {}

  async detect(): Promise<StepOutcome | null> {
    this.detectCalls++;
    return this.detectResult;
  }

  async execute(): Promise<StepOutcome> {
    this.executeCalls++;
    return this.executeResult;
  }
}

class RecordingEmitter implements WizardEventEmitter {
  public started: StepId[] = [];
  public completed: Array<{ id: StepId; status: string }> = [];
  public warnings: string[] = [];
  public resumeBanners: Array<{ stepId: StepId; position: number; total: number }> = [];
  public doneSummaries: Record<string, unknown>[] = [];

  emitStepStarted(stepId: StepId): void {
    this.started.push(stepId);
  }
  emitStepCompleted(stepId: StepId, outcome: StepOutcome): void {
    this.completed.push({ id: stepId, status: outcome.status });
  }
  emitAwaitingInput(): void {}
  emitInstructions(): void {}
  emitWarning(message: string): void {
    this.warnings.push(message);
  }
  emitResumeBanner(stepId: StepId, position: number, total: number): void {
    this.resumeBanners.push({ stepId, position, total });
  }
  emitDone(summary: Record<string, unknown>): void {
    this.doneSummaries.push(summary);
  }
}

class RecordingStateGateway implements SetupStateGateway {
  public saved: SetupState[] = [];

  constructor(private readonly loadResult: SetupStateLoadResult) {}

  load(): SetupStateLoadResult {
    return this.loadResult;
  }
  save(state: SetupState): void {
    this.saved.push(state);
  }
  reset(): void {}
}

function buildContext(
  emitter: WizardEventEmitter,
  stateGateway: SetupStateGateway,
  yes = false,
): WizardContext {
  return {
    state: null,
    currentStepId: null,
    project: {
      localPath: '/tmp/p',
      platform: 'github',
      preset: 'backend',
      language: 'en',
      remoteUrl: null,
    },
    flags: { path: '/tmp/p', json: false, force: false, ai: false, yes, showSecrets: false },
    gateways: {
      setupState: stateGateway,
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
      gitRemote: new StubGitRemoteGateway({ projectPath: '/tmp/p' }),
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt: new StubPromptGateway(),
    },
    emitter,
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('OrchestrateSetupUseCase', () => {
  const orchestrator = new OrchestrateSetupUseCase();

  it('runs every step and returns exit code 0 when all succeed', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', null, succeeded()),
      new FakeStep('claude-login', 'Login', null, succeeded()),
      new FakeStep('daemon', 'Daemon', null, succeeded()),
    ];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps,
    });

    expect(result.exitCode).toBe(0);
    expect(result.resumedFromStepId).toBeNull();
    expect(result.stateWasCorrupted).toBe(false);
    expect(steps.every((step) => step.executeCalls === 1)).toBe(true);
    expect(emitter.started).toHaveLength(3);
    expect(emitter.doneSummaries).toHaveLength(1);
  });

  it('saves state after every step', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', null, succeeded()),
      new FakeStep('claude-login', 'Login', null, succeeded()),
    ];

    await orchestrator.execute({ context: buildContext(emitter, stateGateway), steps });

    expect(stateGateway.saved).toHaveLength(2);
    expect(stateGateway.saved[1].steps['claude-login']?.status).toBe('succeeded');
  });

  it('skips already-succeeded steps without executing them (idempotence)', async () => {
    const emitter = new RecordingEmitter();
    const loaded = SetupStateFactory.create({
      steps: { dependencies: succeeded(), 'claude-login': succeeded() },
    });
    const stateGateway = new RecordingStateGateway({ state: loaded, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', succeeded(), succeeded()),
      new FakeStep('claude-login', 'Login', succeeded(), succeeded()),
    ];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps,
    });

    expect(result.exitCode).toBe(0);
    expect(steps.every((step) => step.executeCalls === 0)).toBe(true);
    expect(emitter.started).toHaveLength(0);
  });

  it('resumes from the first incomplete step and emits a resume banner', async () => {
    const emitter = new RecordingEmitter();
    const loaded = SetupStateFactory.create({ steps: { dependencies: succeeded() } });
    const stateGateway = new RecordingStateGateway({ state: loaded, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', succeeded(), succeeded()),
      new FakeStep('claude-login', 'Login', null, succeeded()),
      new FakeStep('daemon', 'Daemon', null, succeeded()),
    ];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps,
    });

    expect(result.resumedFromStepId).toBe('claude-login');
    expect(emitter.resumeBanners).toEqual([{ stepId: 'claude-login', position: 2, total: 3 }]);
    expect(steps[1].executeCalls).toBe(1);
  });

  it('returns exit code 2 and stops on a blocking step in non-interactive mode', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', null, succeeded()),
      new FakeStep('claude-login', 'Login', null, blocked('blocked', 'fix it')),
      new FakeStep('daemon', 'Daemon', null, succeeded()),
    ];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway, true),
      steps,
    });

    expect(result.exitCode).toBe(2);
    expect(steps[2].executeCalls).toBe(0);
    expect(emitter.doneSummaries).toHaveLength(1);
  });

  it('returns exit code 1 on a blocking step in interactive mode', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const steps = [
      new FakeStep('dependencies', 'Deps', null, blocked('blocked', 'fix it')),
      new FakeStep('claude-login', 'Login', null, succeeded()),
    ];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway, false),
      steps,
    });

    expect(result.exitCode).toBe(1);
    expect(steps[1].executeCalls).toBe(0);
  });

  it('maps an AwaitingInputClosedError thrown by a step to a blocked outcome', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const throwingStep: SetupStep = {
      id: 'add-project',
      title: 'Add project',
      async detect() {
        return null;
      },
      async execute() {
        throw new AwaitingInputClosedError();
      },
    };

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps: [throwingStep],
    });

    expect(result.exitCode).toBe(1);
    const outcome = result.finalState.steps['add-project'];
    expect(outcome?.status).toBe('blocked');
    expect(outcome?.message).toBe('Aucune réponse reçue, le setup est interrompu');
  });

  it('maps a NonInteractiveInputError thrown by a step to a blocked outcome', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    const throwingStep: SetupStep = {
      id: 'add-project',
      title: 'Add project',
      async detect() {
        return null;
      },
      async execute() {
        throw new NonInteractiveInputError();
      },
    };

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway, true),
      steps: [throwingStep],
    });

    expect(result.exitCode).toBe(2);
    const outcome = result.finalState.steps['add-project'];
    expect(outcome?.status).toBe('blocked');
    expect(outcome?.message).toBe(
      'Mode non-interactif : aucune entrée disponible pour cette étape',
    );
  });

  it('exposes the current step id on the context while a step executes', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: false });
    let seen: StepId | null = null;
    const observingStep: SetupStep = {
      id: 'daemon',
      title: 'Daemon',
      async detect() {
        return null;
      },
      async execute(context: WizardContext) {
        seen = context.currentStepId;
        return succeeded();
      },
    };

    await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps: [observingStep],
    });

    expect(seen).toBe('daemon');
  });

  it('warns and starts fresh when the loaded state is corrupted', async () => {
    const emitter = new RecordingEmitter();
    const stateGateway = new RecordingStateGateway({ state: null, corrupted: true });
    const steps = [new FakeStep('dependencies', 'Deps', null, succeeded())];

    const result = await orchestrator.execute({
      context: buildContext(emitter, stateGateway),
      steps,
    });

    expect(result.stateWasCorrupted).toBe(true);
    expect(emitter.warnings.length).toBeGreaterThan(0);
    expect(result.exitCode).toBe(0);
  });
});
