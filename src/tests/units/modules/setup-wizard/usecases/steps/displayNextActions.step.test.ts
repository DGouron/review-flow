import { describe, it, expect } from 'vitest';

import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { DisplayNextActionsStep } from '@/modules/setup-wizard/usecases/steps/displayNextActions.step.js';
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

interface BuildOptions {
  platform?: Platform | null;
  showSecrets?: boolean;
  envFile?: StubEnvFileGateway;
  writer?: (line: string) => void;
}

function buildContext(options: BuildOptions = {}): WizardContext {
  const envFile = options.envFile ?? new StubEnvFileGateway();
  const platform = options.platform === undefined ? 'github' : options.platform;
  return {
    state: null,
    currentStepId: null,
    project: { localPath: '/tmp/p', platform, preset: 'backend', language: 'en', remoteUrl: null },
    flags: {
      path: '/tmp/p',
      json: false,
      force: false,
      ai: false,
      yes: false,
      showSecrets: options.showSecrets ?? false,
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
      prompt: new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(options.writer ?? (() => undefined)),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('DisplayNextActionsStep', () => {
  const step = new DisplayNextActionsStep(new NextActionsPresenter());

  it('always executes (detect returns null)', async () => {
    const outcome = await step.detect(buildContext());
    expect(outcome).toBeNull();
  });

  it('succeeds and exposes the webhook url in evidence', async () => {
    const outcome = await step.execute(buildContext({ platform: 'github' }));
    expect(outcome.status).toBe('succeeded');
    expect(outcome.evidence?.webhookUrl).toContain('/webhooks/github');
  });

  it('prints the webhook instructions to the human user', async () => {
    const written: string[] = [];
    const envFile = new StubEnvFileGateway();
    envFile.seedSecrets('/tmp/p');
    await step.execute(
      buildContext({ platform: 'github', envFile, writer: (line) => written.push(line) }),
    );
    const output = written.join('\n');
    expect(output).toContain('Configurez le webhook');
    expect(output).toContain('/webhooks/github');
  });

  it('uses gitlab webhook url when platform is gitlab', async () => {
    const written: string[] = [];
    const envFile = new StubEnvFileGateway();
    envFile.seedSecrets('/tmp/p');
    await step.execute(
      buildContext({ platform: 'gitlab', envFile, writer: (line) => written.push(line) }),
    );
    expect(written.join('\n')).toContain('/webhooks/gitlab');
  });

  it('defaults to github when platform is unknown', async () => {
    const written: string[] = [];
    await step.execute(buildContext({ platform: null, writer: (line) => written.push(line) }));
    expect(written.join('\n')).toContain('/webhooks/github');
  });

  it('hides the full secret unless showSecrets is set', async () => {
    const secret = 'b'.repeat(64);
    const writtenMasked: string[] = [];
    const envMasked = new StubEnvFileGateway();
    envMasked.seedSecrets('/tmp/p', 'a'.repeat(64), secret);
    await step.execute(
      buildContext({
        platform: 'github',
        envFile: envMasked,
        showSecrets: false,
        writer: (line) => writtenMasked.push(line),
      }),
    );
    expect(writtenMasked.join('\n')).not.toContain(secret);

    const writtenShown: string[] = [];
    const envShown = new StubEnvFileGateway();
    envShown.seedSecrets('/tmp/p', 'a'.repeat(64), secret);
    await step.execute(
      buildContext({
        platform: 'github',
        envFile: envShown,
        showSecrets: true,
        writer: (line) => writtenShown.push(line),
      }),
    );
    expect(writtenShown.join('\n')).toContain(secret);
  });
});
