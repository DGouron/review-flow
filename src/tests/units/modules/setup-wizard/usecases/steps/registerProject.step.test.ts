import { describe, it, expect } from 'vitest';

import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { RegisterProjectStep } from '@/modules/setup-wizard/usecases/steps/registerProject.step.js';
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

function noopStateGateway(): SetupStateGateway {
  return {
    load: () => ({ state: null, corrupted: false }),
    save: () => undefined,
    reset: () => undefined,
  };
}

function buildContext(
  serverConfig: StubServerConfigGateway,
  healthProbe: StubDaemonHealthProbeGateway,
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
    flags: { path: '/tmp/p', json: false, force: false, ai: false, yes: false, showSecrets: false },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: healthProbe,
      envFile: new StubEnvFileGateway(),
      gitRemote: new StubGitRemoteGateway({ projectPath: '/tmp/p' }),
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig,
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt: new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('RegisterProjectStep', () => {
  const step = new RegisterProjectStep();

  it('detects skipped when project is already registered', async () => {
    const serverConfig = new StubServerConfigGateway();
    serverConfig.seedProject('/tmp/p');
    const outcome = await step.detect(
      buildContext(serverConfig, new StubDaemonHealthProbeGateway()),
    );
    expect(outcome?.status).toBe('skipped');
  });

  it('adds the project and succeeds when daemon is healthy', async () => {
    const serverConfig = new StubServerConfigGateway();
    const outcome = await step.execute(
      buildContext(serverConfig, new StubDaemonHealthProbeGateway()),
    );
    expect(outcome.status).toBe('succeeded');
    expect(serverConfig.addProjectCallCount).toBe(1);
  });

  it('warns when daemon is unreachable but adds project anyway', async () => {
    const serverConfig = new StubServerConfigGateway();
    const probe = new StubDaemonHealthProbeGateway({ healthy: false });
    const outcome = await step.execute(buildContext(serverConfig, probe));
    expect(outcome.status).toBe('warning');
    expect(serverConfig.addProjectCallCount).toBe(1);
  });
});
