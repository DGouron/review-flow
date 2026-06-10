import { describe, it, expect } from 'vitest';

import type { ClaudeAuthGateway } from '@/modules/setup-wizard/entities/claudeAuth/claudeAuth.gateway.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { ClaudeLoginStep } from '@/modules/setup-wizard/usecases/steps/claudeLogin.step.js';
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

function buildContext(claudeAuth: ClaudeAuthGateway, yes = false): WizardContext {
  return {
    state: null,
    currentStepId: null,
    project: { localPath: '/tmp/p', platform: null, preset: null, language: null, remoteUrl: null },
    flags: { path: '/tmp/p', json: false, force: false, ai: false, yes, showSecrets: false },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth,
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

describe('ClaudeLoginStep', () => {
  const step = new ClaudeLoginStep();

  it('detects skipped when already authenticated', async () => {
    const claudeAuth = new StubClaudeAuthGateway({ loggedIn: true });
    const outcome = await step.detect(buildContext(claudeAuth));
    expect(outcome?.status).toBe('skipped');
  });

  it('triggers login interactively when not authenticated', async () => {
    const claudeAuth = new StubClaudeAuthGateway({ loggedIn: false });
    const outcome = await step.execute(buildContext(claudeAuth));
    expect(outcome.status).toBe('succeeded');
    expect(claudeAuth.triggerLoginCallCount).toBe(1);
  });

  it('blocks when login fails', async () => {
    const claudeAuth = new StubClaudeAuthGateway({
      loggedIn: false,
      loginResult: { success: false, error: 'OAuth flow cancelled' },
    });
    const outcome = await step.execute(buildContext(claudeAuth));
    expect(outcome.status).toBe('blocked');
  });

  it('blocks under -y when not authenticated', async () => {
    const claudeAuth = new StubClaudeAuthGateway({ loggedIn: false });
    const outcome = await step.execute(buildContext(claudeAuth, true));
    expect(outcome.status).toBe('blocked');
    expect(outcome.remediation).toContain('claude /login');
    expect(claudeAuth.triggerLoginCallCount).toBe(0);
  });
});
