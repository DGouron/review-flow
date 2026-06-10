import { describe, it, expect } from 'vitest';

import type { DependencyProbeGateway } from '@/modules/setup-wizard/entities/dependencyProbe/dependencyProbe.gateway.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { CheckDependenciesStep } from '@/modules/setup-wizard/usecases/steps/checkDependencies.step.js';
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

function buildContext(probe: DependencyProbeGateway): WizardContext {
  return {
    state: null,
    currentStepId: null,
    project: { localPath: '/tmp/p', platform: null, preset: null, language: null, remoteUrl: null },
    flags: { path: '/tmp/p', json: false, force: false, ai: false, yes: false, showSecrets: false },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: probe,
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
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('CheckDependenciesStep', () => {
  const step = new CheckDependenciesStep();

  it('returns succeeded when every dependency is present with proper version', async () => {
    const probe = new StubDependencyProbeGateway();
    const outcome = await step.execute(buildContext(probe));
    expect(outcome.status).toBe('succeeded');
  });

  it('blocks when node version is below 20', async () => {
    const probe = new StubDependencyProbeGateway({ node: { present: true, version: '18.0.0' } });
    const outcome = await step.execute(buildContext(probe));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('20');
    expect(outcome.message).toContain('18.0.0');
  });

  it('blocks when claude CLI is missing with remediation link', async () => {
    const probe = new StubDependencyProbeGateway({ claude: { present: false, version: null } });
    const outcome = await step.execute(buildContext(probe));
    expect(outcome.status).toBe('blocked');
    expect(outcome.remediation).toContain('https://docs.anthropic.com');
  });

  it('emits warning when both gh and glab are missing but other deps are ok', async () => {
    const probe = new StubDependencyProbeGateway({
      gh: { present: false, version: null },
      glab: { present: false, version: null },
    });
    const outcome = await step.execute(buildContext(probe));
    expect(outcome.status).toBe('warning');
  });
});
