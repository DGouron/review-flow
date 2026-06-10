/**
 * SPEC-187 — Read setup wizard answers from stdin in JSON mode
 *
 * Spec: docs/specs/187-setup-wizard-json-stdin-input.md
 * Plan: docs/plans/187-setup-wizard-json-stdin-input.plan.md
 *
 * Outer-loop acceptance test (SDD). Stays RED while inside-out TDD builds the
 * stdin prompt gateway + the line-reader seam, turns GREEN when a scripted JSON
 * line feed drives a full --json run that needs input to completion.
 */

import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { PromptStdinJsonGateway } from '@/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.js';
import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { JsonWizardEventEmitter } from '@/modules/setup-wizard/services/jsonWizardEventEmitter.js';
import { OrchestrateSetupUseCase } from '@/modules/setup-wizard/usecases/orchestrateSetup.usecase.js';
import { AddProjectStep } from '@/modules/setup-wizard/usecases/steps/addProject.step.js';
import { CheckDependenciesStep } from '@/modules/setup-wizard/usecases/steps/checkDependencies.step.js';
import { ClaudeLoginStep } from '@/modules/setup-wizard/usecases/steps/claudeLogin.step.js';
import { ConfigurePipelineStep } from '@/modules/setup-wizard/usecases/steps/configurePipeline.step.js';
import { DaemonInstallStep } from '@/modules/setup-wizard/usecases/steps/daemonInstall.step.js';
import { DisplayNextActionsStep } from '@/modules/setup-wizard/usecases/steps/displayNextActions.step.js';
import { GenerateFilesStep } from '@/modules/setup-wizard/usecases/steps/generateFiles.step.js';
import { GenerateSecretsStep } from '@/modules/setup-wizard/usecases/steps/generateSecrets.step.js';
import { RegisterProjectStep } from '@/modules/setup-wizard/usecases/steps/registerProject.step.js';
import { ValidateSetupStep } from '@/modules/setup-wizard/usecases/steps/validateSetup.step.js';
import { StubAiFallbackGateway } from '@/tests/stubs/setup-wizard/aiFallback.stub.js';
import { StubClaudeAuthGateway } from '@/tests/stubs/setup-wizard/claudeAuth.stub.js';
import { StubDaemonHealthProbeGateway } from '@/tests/stubs/setup-wizard/daemonHealthProbe.stub.js';
import { StubDaemonServiceGateway } from '@/tests/stubs/setup-wizard/daemonService.stub.js';
import { StubDependencyProbeGateway } from '@/tests/stubs/setup-wizard/dependencyProbe.stub.js';
import { StubEnvFileGateway } from '@/tests/stubs/setup-wizard/envFile.stub.js';
import { StubGitRemoteGateway } from '@/tests/stubs/setup-wizard/gitRemote.stub.js';
import { StubLineReader } from '@/tests/stubs/setup-wizard/lineReader.stub.js';
import { StubProjectConfigGateway } from '@/tests/stubs/setup-wizard/projectConfig.stub.js';
import { StubServerConfigGateway } from '@/tests/stubs/setup-wizard/serverConfig.stub.js';
import { StubSkillTemplateGateway } from '@/tests/stubs/setup-wizard/skillTemplate.stub.js';
import { StubValidationGateway } from '@/tests/stubs/setup-wizard/validation.stub.js';

interface WizardEvent {
  step: string;
  status: string;
  prompt?: string;
  message?: string;
}

interface BuildContextOptions {
  lines: string[];
  ambiguousPlatform?: boolean;
  daemonInactive?: boolean;
  yes?: boolean;
}

describe('Acceptance — SPEC-187: Read setup wizard answers from stdin in JSON mode', () => {
  let rootDir: string;
  let stateFilePath: string;
  let projectPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-187-'));
    stateFilePath = join(rootDir, 'setup-state.json');
    projectPath = join(rootDir, 'my-project');
    mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function buildSteps(): SetupStep[] {
    return [
      new CheckDependenciesStep(),
      new ClaudeLoginStep(),
      new DaemonInstallStep(),
      new GenerateSecretsStep(),
      new AddProjectStep(),
      new ConfigurePipelineStep(),
      new GenerateFilesStep(),
      new RegisterProjectStep(),
      new ValidateSetupStep(),
      new DisplayNextActionsStep(new NextActionsPresenter()),
    ];
  }

  function buildContext(options: BuildContextOptions): {
    context: WizardContext;
    events: WizardEvent[];
  } {
    const events: WizardEvent[] = [];
    const emitter = new JsonWizardEventEmitter((line) => events.push(JSON.parse(line)));
    const platform = options.ambiguousPlatform ? 'unknown' : 'github';
    const remoteUrl = options.ambiguousPlatform
      ? 'git@custom.com:org/repo.git'
      : 'git@github.com:org/repo.git';

    const context: WizardContext = {
      state: null,
      currentStepId: null,
      project: {
        localPath: projectPath,
        platform: null,
        preset: null,
        language: null,
        remoteUrl: null,
      },
      flags: {
        path: projectPath,
        json: true,
        force: false,
        ai: false,
        yes: options.yes ?? false,
        showSecrets: false,
      },
      gateways: {
        setupState: new SetupStateFileSystemGateway({ filePath: stateFilePath }),
        dependencyProbe: new StubDependencyProbeGateway(),
        claudeAuth: new StubClaudeAuthGateway(),
        daemonService: new StubDaemonServiceGateway(
          options.daemonInactive ? { initialStatus: { status: 'inactive' } } : {},
        ),
        daemonHealthProbe: new StubDaemonHealthProbeGateway(),
        envFile: new StubEnvFileGateway(),
        gitRemote: new StubGitRemoteGateway({ projectPath, platform, remoteUrl }),
        projectConfig: new StubProjectConfigGateway(),
        skillTemplate: new StubSkillTemplateGateway(),
        serverConfig: new StubServerConfigGateway(),
        validation: new StubValidationGateway(),
        aiFallback: new StubAiFallbackGateway(),
        prompt: new PromptStdinJsonGateway({
          lineReader: new StubLineReader(options.lines),
          emitter,
          currentStepId: () => context.currentStepId ?? 'add-project',
          isNonInteractive: () => context.flags.yes,
        }),
      },
      emitter,
      now: () => new Date('2026-05-28T10:00:00.000Z'),
    };
    return { context, events };
  }

  it('drives a full --json run that exercises confirm, choice and multiSelect to completion', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context, events } = buildContext({
      ambiguousPlatform: true,
      daemonInactive: true,
      lines: [
        'true', // daemon confirm
        '"github"', // add-project choice (platform)
        '"custom"', // pipeline preset choice
        '["solid","testing"]', // pipeline multiSelect agents
        '"en"', // pipeline language choice
      ],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(context.project.platform).toBe('github');
    expect(context.project.preset).toBe('custom');
    const done = events[events.length - 1];
    expect(done.step).toBe('done');
    expect(done.status).toBe('completed');
  });

  it('announces awaiting_input before reading an answer', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context, events } = buildContext({
      ambiguousPlatform: true,
      lines: ['"gitlab"', '"backend"', '"en"'],
    });

    await orchestrator.execute({ context, steps: buildSteps() });

    const awaiting = events.filter((event) => event.status === 'awaiting_input');
    expect(awaiting.length).toBeGreaterThan(0);
    expect(awaiting[0].step).toBe('add-project');
  });

  it('uses the step default when an empty text line is read', async () => {
    const events: WizardEvent[] = [];
    const emitter = new JsonWizardEventEmitter((line) => events.push(JSON.parse(line)));
    const defaultPath = process.cwd();
    const context: WizardContext = {
      state: null,
      currentStepId: 'add-project',
      project: { localPath: null, platform: null, preset: null, language: null, remoteUrl: null },
      flags: { path: null, json: true, force: false, ai: false, yes: false, showSecrets: false },
      gateways: {
        setupState: new SetupStateFileSystemGateway({ filePath: stateFilePath }),
        dependencyProbe: new StubDependencyProbeGateway(),
        claudeAuth: new StubClaudeAuthGateway(),
        daemonService: new StubDaemonServiceGateway(),
        daemonHealthProbe: new StubDaemonHealthProbeGateway(),
        envFile: new StubEnvFileGateway(),
        gitRemote: new StubGitRemoteGateway({
          projectPath: defaultPath,
          platform: 'github',
          remoteUrl: 'git@github.com:org/repo.git',
        }),
        projectConfig: new StubProjectConfigGateway(),
        skillTemplate: new StubSkillTemplateGateway(),
        serverConfig: new StubServerConfigGateway(),
        validation: new StubValidationGateway(),
        aiFallback: new StubAiFallbackGateway(),
        prompt: new PromptStdinJsonGateway({
          lineReader: new StubLineReader(['']),
          emitter,
          currentStepId: () => context.currentStepId ?? 'add-project',
          isNonInteractive: () => context.flags.yes,
        }),
      },
      emitter,
      now: () => new Date('2026-05-28T10:00:00.000Z'),
    };

    const outcome = await new AddProjectStep().execute(context);

    expect(outcome.status).toBe('succeeded');
    expect(context.project.localPath).toBe(defaultPath);
  });

  it('re-announces and accepts the next line when a single choice is not offered', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context, events } = buildContext({
      ambiguousPlatform: true,
      lines: ['"mobile"', '"gitlab"', '"backend"', '"en"'],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(context.project.platform).toBe('gitlab');
    const warnings = events.filter((event) => event.status === 'warning');
    expect(
      warnings.some(
        (event) => event.message === 'Choix invalide, sélectionnez une option proposée',
      ),
    ).toBe(true);
    const awaiting = events.filter(
      (event) => event.status === 'awaiting_input' && event.step === 'add-project',
    );
    expect(awaiting.length).toBe(2);
  });

  it('re-announces and accepts the next line when a multiSelect value is not offered', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context, events } = buildContext({
      lines: ['"custom"', '["solid","mobile"]', '["solid"]', '"en"'],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(context.project.preset).toBe('custom');
    const warnings = events.filter((event) => event.status === 'warning');
    expect(
      warnings.some(
        (event) => event.message === "Sélection invalide, une valeur n'est pas proposée",
      ),
    ).toBe(true);
  });

  it('re-announces and accepts the next line when a malformed line arrives', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context, events } = buildContext({
      ambiguousPlatform: true,
      lines: ['{not json', '"github"', '"backend"', '"en"'],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(context.project.platform).toBe('github');
    const warnings = events.filter((event) => event.status === 'warning');
    expect(warnings.some((event) => event.message === 'Réponse illisible')).toBe(true);
  });

  it('blocks the step when the input stream closes before an answer', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context } = buildContext({
      ambiguousPlatform: true,
      lines: [],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(1);
    const outcome = result.finalState.steps['add-project'];
    expect(outcome?.status).toBe('blocked');
    expect(outcome?.message).toBe('Aucune réponse reçue, le setup est interrompu');
  });

  it('blocks a step needing input in non-interactive (-y) mode without reading stdin', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const { context } = buildContext({
      ambiguousPlatform: true,
      yes: true,
      lines: [],
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(2);
    const outcome = result.finalState.steps['add-project'];
    expect(outcome?.status).toBe('blocked');
  });
});
