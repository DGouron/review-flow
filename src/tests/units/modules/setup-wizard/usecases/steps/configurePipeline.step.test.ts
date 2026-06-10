import { describe, it, expect } from 'vitest';

import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { ConfigurePipelineStep } from '@/modules/setup-wizard/usecases/steps/configurePipeline.step.js';
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

function buildContext(prompt: StubPromptGateway, yes = false): WizardContext {
  return {
    state: null,
    currentStepId: null,
    project: {
      localPath: '/tmp/p',
      platform: 'github',
      preset: null,
      language: null,
      remoteUrl: null,
    },
    flags: { path: '/tmp/p', json: false, force: false, ai: false, yes, showSecrets: false },
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
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt,
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('ConfigurePipelineStep', () => {
  const step = new ConfigurePipelineStep();

  it('resolves agents for the backend preset', async () => {
    const prompt = new StubPromptGateway();
    prompt.queueChoice('backend');
    prompt.queueChoice('en');
    const context = buildContext(prompt);
    const outcome = await step.execute(context);
    expect(outcome.status).toBe('succeeded');
    expect(context.project.preset).toBe('backend');
    expect(context.project.language).toBe('en');
  });

  it('uses defaults under -y mode (backend / en)', async () => {
    const prompt = new StubPromptGateway();
    const context = buildContext(prompt, true);
    const outcome = await step.execute(context);
    expect(outcome.status).toBe('succeeded');
    expect(context.project.preset).toBe('backend');
    expect(context.project.language).toBe('en');
  });

  it('blocks custom preset when zero agents are selected', async () => {
    const prompt = new StubPromptGateway();
    prompt.queueChoice('custom');
    prompt.queueMultiSelect([]);
    const outcome = await step.execute(buildContext(prompt));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('agent');
  });

  it('honors French language selection', async () => {
    const prompt = new StubPromptGateway();
    prompt.queueChoice('frontend');
    prompt.queueChoice('fr');
    const context = buildContext(prompt);
    const outcome = await step.execute(context);
    expect(outcome.status).toBe('succeeded');
    expect(context.project.language).toBe('fr');
  });
});
