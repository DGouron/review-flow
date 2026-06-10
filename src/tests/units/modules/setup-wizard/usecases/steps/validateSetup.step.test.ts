import { describe, it, expect } from 'vitest';

import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { ValidationGateway } from '@/modules/setup-wizard/entities/validation/validation.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
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

function noopStateGateway(): SetupStateGateway {
  return {
    load: () => ({ state: null, corrupted: false }),
    save: () => undefined,
    reset: () => undefined,
  };
}

function buildContext(validation: ValidationGateway): WizardContext {
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
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
      gitRemote: new StubGitRemoteGateway({ projectPath: '/tmp/p' }),
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation,
      aiFallback: new StubAiFallbackGateway(),
      prompt: new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('ValidateSetupStep', () => {
  const step = new ValidateSetupStep();

  it('succeeds when validation reports no issues', async () => {
    const outcome = await step.execute(buildContext(new StubValidationGateway()));
    expect(outcome.status).toBe('succeeded');
  });

  it('warns when validation reports warnings only', async () => {
    const validation = new StubValidationGateway({
      report: {
        status: 'invalid',
        issues: [{ field: 'gh', message: 'gh not installed', severity: 'warning' }],
      },
    });
    const outcome = await step.execute(buildContext(validation));
    expect(outcome.status).toBe('warning');
  });

  it('blocks when validation reports errors', async () => {
    const validation = new StubValidationGateway({
      report: {
        status: 'invalid',
        issues: [{ field: 'server.port', message: 'invalid port', severity: 'error' }],
      },
    });
    const outcome = await step.execute(buildContext(validation));
    expect(outcome.status).toBe('blocked');
  });

  it('blocks when configuration is not found', async () => {
    const validation = new StubValidationGateway({ report: { status: 'not-found', issues: [] } });
    const outcome = await step.execute(buildContext(validation));
    expect(outcome.status).toBe('blocked');
  });
});
