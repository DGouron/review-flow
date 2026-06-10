import { describe, it, expect } from 'vitest';

import type { EnvFileGateway } from '@/modules/setup-wizard/entities/envFile/envFile.gateway.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { GenerateSecretsStep } from '@/modules/setup-wizard/usecases/steps/generateSecrets.step.js';
import { isValidSecret } from '@/shared/services/secretGenerator.js';
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
  envFile: EnvFileGateway,
  options: { prompt?: StubPromptGateway; yes?: boolean } = {},
): WizardContext {
  return {
    state: null,
    currentStepId: null,
    project: { localPath: '/tmp/p', platform: null, preset: null, language: null, remoteUrl: null },
    flags: {
      path: '/tmp/p',
      json: false,
      force: false,
      ai: false,
      yes: options.yes ?? false,
      showSecrets: false,
    },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile,
      gitRemote: new StubGitRemoteGateway({ projectPath: '/tmp/p' }),
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt: options.prompt ?? new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('GenerateSecretsStep', () => {
  const step = new GenerateSecretsStep();

  it('detects skipped when both secrets are valid 64-hex', async () => {
    const env = new StubEnvFileGateway();
    env.seedSecrets('/tmp/p');
    const outcome = await step.detect(buildContext(env));
    expect(outcome?.status).toBe('skipped');
  });

  it('generates fresh secrets and writes .env when secrets are absent', async () => {
    const env = new StubEnvFileGateway();
    const outcome = await step.execute(buildContext(env));
    expect(outcome.status).toBe('succeeded');
    expect(env.writeCallCount).toBe(1);
    expect(env.ensureGitignoredCallCount).toBe(1);
    const written = env.read('/tmp/p');
    expect(written.gitlabSecret).not.toBeNull();
    expect(written.githubSecret).not.toBeNull();
    if (written.gitlabSecret && written.githubSecret) {
      expect(isValidSecret(written.gitlabSecret)).toBe(true);
      expect(isValidSecret(written.githubSecret)).toBe(true);
    }
  });

  it('regenerates when placeholders detected and user confirms', async () => {
    const env = new StubEnvFileGateway();
    env.seedSecrets('/tmp/p', 'placeholder_token', 'placeholder_token');
    const prompt = new StubPromptGateway();
    prompt.queueConfirm(true);
    const outcome = await step.execute(buildContext(env, { prompt }));
    expect(outcome.status).toBe('succeeded');
    expect(env.writeCallCount).toBe(1);
  });

  it('keeps placeholders unchanged when user refuses regeneration', async () => {
    const env = new StubEnvFileGateway();
    env.seedSecrets('/tmp/p', 'placeholder_token', 'placeholder_token');
    const prompt = new StubPromptGateway();
    prompt.queueConfirm(false);
    const outcome = await step.execute(buildContext(env, { prompt }));
    expect(outcome.status).toBe('blocked');
    expect(env.writeCallCount).toBe(0);
  });
});
