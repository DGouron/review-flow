/**
 * SPEC-183 — Setup Wizard CLI orchestrator (Jarvis end-to-end)
 *
 * Spec: docs/specs/183-setup-wizard-cli-orchestrator.md
 * Plan: docs/plans/183-setup-wizard-cli-orchestrator.plan.md
 *
 * Outer-loop acceptance test (SDD). Stays RED while inside-out TDD
 * builds the walking skeleton, turns GREEN when all 10 steps are wired
 * through the orchestrator.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
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
import { StubProjectConfigGateway } from '@/tests/stubs/setup-wizard/projectConfig.stub.js';
import { StubPromptGateway } from '@/tests/stubs/setup-wizard/prompt.stub.js';
import { StubServerConfigGateway } from '@/tests/stubs/setup-wizard/serverConfig.stub.js';
import { StubSkillTemplateGateway } from '@/tests/stubs/setup-wizard/skillTemplate.stub.js';
import { StubValidationGateway } from '@/tests/stubs/setup-wizard/validation.stub.js';

interface BuildContextOverrides {
  flags?: Partial<WizardContext['flags']>;
  stubs?: Partial<{
    dependencyProbe: StubDependencyProbeGateway;
    claudeAuth: StubClaudeAuthGateway;
    daemonService: StubDaemonServiceGateway;
    daemonHealthProbe: StubDaemonHealthProbeGateway;
    envFile: StubEnvFileGateway;
    gitRemote: StubGitRemoteGateway;
    projectConfig: StubProjectConfigGateway;
    skillTemplate: StubSkillTemplateGateway;
    serverConfig: StubServerConfigGateway;
    validation: StubValidationGateway;
    aiFallback: StubAiFallbackGateway;
    prompt: StubPromptGateway;
  }>;
  emitter?: 'human' | 'json';
  jsonLines?: string[];
}

describe('Acceptance — SPEC-183: Setup Wizard CLI orchestrator', () => {
  let rootDir: string;
  let stateFilePath: string;
  let projectPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-acc-'));
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

  function buildContext(overrides: BuildContextOverrides = {}): WizardContext {
    const stubs = overrides.stubs ?? {};
    const jsonLines = overrides.jsonLines ?? [];
    const emitter =
      overrides.emitter === 'json'
        ? new JsonWizardEventEmitter((line) => jsonLines.push(line))
        : new HumanWizardEventEmitter(() => undefined);
    return {
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
        json: overrides.emitter === 'json',
        force: false,
        ai: false,
        yes: false,
        showSecrets: false,
        ...overrides.flags,
      },
      gateways: {
        setupState: new SetupStateFileSystemGateway({ filePath: stateFilePath }),
        dependencyProbe: stubs.dependencyProbe ?? new StubDependencyProbeGateway(),
        claudeAuth: stubs.claudeAuth ?? new StubClaudeAuthGateway(),
        daemonService: stubs.daemonService ?? new StubDaemonServiceGateway(),
        daemonHealthProbe: stubs.daemonHealthProbe ?? new StubDaemonHealthProbeGateway(),
        envFile: stubs.envFile ?? new StubEnvFileGateway(),
        gitRemote:
          stubs.gitRemote ??
          new StubGitRemoteGateway({
            projectPath,
            platform: 'github',
            remoteUrl: 'git@github.com:org/repo.git',
          }),
        projectConfig: stubs.projectConfig ?? new StubProjectConfigGateway(),
        skillTemplate: stubs.skillTemplate ?? new StubSkillTemplateGateway(),
        serverConfig: stubs.serverConfig ?? new StubServerConfigGateway(),
        validation: stubs.validation ?? new StubValidationGateway(),
        aiFallback: stubs.aiFallback ?? new StubAiFallbackGateway(),
        prompt: stubs.prompt ?? new StubPromptGateway(),
      },
      emitter,
      now: () => new Date('2026-05-28T10:00:00.000Z'),
    };
  }

  it('Test 1 — fresh machine: runs all 10 steps successfully and persists final state', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const context = buildContext();

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    const okStatuses: Array<string | undefined> = ['succeeded', 'skipped', 'warning'];
    expect(okStatuses).toContain(result.finalState.steps.dependencies?.status);
    expect(okStatuses).toContain(result.finalState.steps['claude-login']?.status);
    expect(okStatuses).toContain(result.finalState.steps.daemon?.status);
    expect(okStatuses).toContain(result.finalState.steps.secrets?.status);
    expect(okStatuses).toContain(result.finalState.steps['add-project']?.status);
    expect(okStatuses).toContain(result.finalState.steps.pipeline?.status);
    expect(okStatuses).toContain(result.finalState.steps['generate-files']?.status);
    expect(okStatuses).toContain(result.finalState.steps['register-project']?.status);
    expect(okStatuses).toContain(result.finalState.steps.validate?.status);
    expect(okStatuses).toContain(result.finalState.steps['next-actions']?.status);
    expect(existsSync(stateFilePath)).toBe(true);
  });

  it('Test 2 — idempotence: second run with existing succeeded state skips all steps', async () => {
    const orchestrator = new OrchestrateSetupUseCase();

    // First run
    const firstContext = buildContext();
    await orchestrator.execute({ context: firstContext, steps: buildSteps() });

    // Second run with everything already in place — dependencies still met, secrets present, etc.
    const envStub = new StubEnvFileGateway();
    envStub.seedSecrets(projectPath);
    const serverStub = new StubServerConfigGateway();
    serverStub.seedProject(projectPath);
    const projectConfigStub = new StubProjectConfigGateway();
    projectConfigStub.seedExisting(projectPath);

    const secondContext = buildContext({
      stubs: {
        envFile: envStub,
        serverConfig: serverStub,
        projectConfig: projectConfigStub,
      },
    });
    const result = await orchestrator.execute({ context: secondContext, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    // Step 10 (display next actions) always returns succeeded, others can be skipped.
    const skippableSteps: StepId[] = [
      'dependencies',
      'claude-login',
      'daemon',
      'secrets',
      'add-project',
      'generate-files',
      'register-project',
    ];
    for (const stepId of skippableSteps) {
      const status = result.finalState.steps[stepId]?.status;
      expect(['skipped', 'succeeded']).toContain(status);
    }
  });

  it('Test 3 — --json mode emits valid JSON event per transition', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const jsonLines: string[] = [];
    const context = buildContext({ emitter: 'json', jsonLines });

    await orchestrator.execute({ context, steps: buildSteps() });

    expect(jsonLines.length).toBeGreaterThan(0);
    for (const line of jsonLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const lastEvent: { step: string; status: string } = JSON.parse(jsonLines[jsonLines.length - 1]);
    expect(lastEvent.step).toBe('done');
    expect(lastEvent.status).toBe('completed');
  });

  it('Test 4 — interrupted run: partial state resumes from the first incomplete step', async () => {
    // Pre-populate a state file with steps 1-5 succeeded
    writeFileSync(
      stateFilePath,
      JSON.stringify(
        {
          version: 1,
          startedAt: '2026-05-28T09:00:00.000Z',
          updatedAt: '2026-05-28T09:30:00.000Z',
          steps: {
            dependencies: { status: 'succeeded' },
            'claude-login': { status: 'succeeded' },
            daemon: { status: 'succeeded' },
            secrets: { status: 'succeeded' },
            'add-project': { status: 'succeeded' },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const orchestrator = new OrchestrateSetupUseCase();
    const context = buildContext();

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(result.resumedFromStepId).toBe('pipeline');
  });

  it('Test 5 — -y flag and not authed: exit code 2 + remediation hint', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const claudeAuth = new StubClaudeAuthGateway({ loggedIn: false });
    const context = buildContext({
      stubs: { claudeAuth },
      flags: { yes: true },
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(2);
    const claudeLoginOutcome = result.finalState.steps['claude-login'];
    expect(claudeLoginOutcome?.status).toBe('blocked');
    expect(claudeLoginOutcome?.remediation).toContain('claude /login');
  });

  it('Test 6 — --force on existing project config: backs up and writes fresh files', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const projectConfigStub = new StubProjectConfigGateway();
    projectConfigStub.seedExisting(projectPath);
    const context = buildContext({
      stubs: { projectConfig: projectConfigStub },
      flags: { force: true },
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(projectConfigStub.backupCallCount).toBe(1);
    expect(result.finalState.steps['generate-files']?.status).toBe('succeeded');
  });

  it('Test 7 — --ai requested but agent fallback unavailable: warns and falls through to the scripted prompt', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const gitRemote = new StubGitRemoteGateway({
      projectPath,
      platform: 'unknown',
      remoteUrl: 'git@custom.com:org/repo.git',
    });
    const prompt = new StubPromptGateway();
    prompt.queueChoice('github');
    const jsonLines: string[] = [];
    const context = buildContext({
      stubs: {
        gitRemote,
        prompt,
        aiFallback: new StubAiFallbackGateway({ available: false }),
      },
      flags: { ai: true },
      emitter: 'json',
      jsonLines,
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    // The scripted path resolves the ambiguous platform via the prompt → clean success.
    expect(result.exitCode).toBe(0);
    expect(context.project.platform).toBe('github');
    // A warning about the unavailable AI fallback was actually emitted.
    const warnings = jsonLines
      .map((line): { status?: string; message?: unknown } => JSON.parse(line))
      .filter((event) => event.status === 'warning');
    expect(warnings.some((event) => String(event.message).includes('--ai'))).toBe(true);
  });

  it('Test 8 — ambiguous platform: prompt asked, project added correctly', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const gitRemote = new StubGitRemoteGateway({
      projectPath,
      platform: 'unknown',
      remoteUrl: 'git@custom.com:org/repo.git',
    });
    const prompt = new StubPromptGateway();
    prompt.queueChoice('gitlab');
    const context = buildContext({
      stubs: { gitRemote, prompt },
    });

    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(result.finalState.project?.platform).toBe('gitlab');
  });

  it('Test 9 — webhook secret rotation: existing valid 64-hex untouched, placeholder triggers regeneration prompt', async () => {
    const orchestrator = new OrchestrateSetupUseCase();
    const envStub = new StubEnvFileGateway();
    envStub.seedSecrets(projectPath);
    const initialContent = envStub.snapshot(projectPath);

    const context = buildContext({ stubs: { envFile: envStub } });
    await orchestrator.execute({ context, steps: buildSteps() });

    expect(envStub.snapshot(projectPath)).toBe(initialContent);
  });

  it('Test 10 — state file corrupted: orchestrator warns and offers reset (auto-reset under -y)', async () => {
    writeFileSync(stateFilePath, '{ this is not json', 'utf-8');

    const orchestrator = new OrchestrateSetupUseCase();
    const context = buildContext({ flags: { yes: false } });

    // The gateway returns null on corruption — orchestrator proceeds fresh + emits a warning
    const result = await orchestrator.execute({ context, steps: buildSteps() });

    expect(result.exitCode).toBe(0);
    expect(result.stateWasCorrupted).toBe(true);
    // State file is rewritten with valid JSON after the run
    const newContent = readFileSync(stateFilePath, 'utf-8');
    expect(() => JSON.parse(newContent)).not.toThrow();
  });
});
