import { describe, it, expect } from 'vitest';

import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { DaemonInstallStep } from '@/modules/setup-wizard/usecases/steps/daemonInstall.step.js';
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
  daemonService?: StubDaemonServiceGateway;
  prompt?: StubPromptGateway;
  yes?: boolean;
}

function buildContext(options: BuildOptions = {}): WizardContext {
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
      daemonService: options.daemonService ?? new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
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

describe('DaemonInstallStep', () => {
  const step = new DaemonInstallStep();

  it('detects skipped when the daemon is already active', async () => {
    const daemonService = new StubDaemonServiceGateway({ initialStatus: { status: 'active' } });
    const outcome = await step.detect(buildContext({ daemonService }));
    expect(outcome?.status).toBe('skipped');
  });

  it('detects a warning on an unsupported platform', async () => {
    const daemonService = new StubDaemonServiceGateway({
      initialStatus: { status: 'unsupported-platform', platform: 'darwin' },
    });
    const outcome = await step.detect(buildContext({ daemonService }));
    expect(outcome?.status).toBe('warning');
    expect(outcome?.message).toContain('darwin');
  });

  it('returns null from detect when the daemon is inactive (needs execution)', async () => {
    const daemonService = new StubDaemonServiceGateway({ initialStatus: { status: 'inactive' } });
    const outcome = await step.detect(buildContext({ daemonService }));
    expect(outcome).toBeNull();
  });

  it('warns and skips installation when the user declines interactively', async () => {
    const daemonService = new StubDaemonServiceGateway({ initialStatus: { status: 'inactive' } });
    const prompt = new StubPromptGateway();
    prompt.queueConfirm(false);
    const outcome = await step.execute(buildContext({ daemonService, prompt, yes: false }));
    expect(outcome.status).toBe('warning');
    expect(daemonService.installCallCount).toBe(0);
  });

  it('installs and succeeds when the user accepts interactively', async () => {
    const daemonService = new StubDaemonServiceGateway({ initialStatus: { status: 'inactive' } });
    const prompt = new StubPromptGateway();
    prompt.queueConfirm(true);
    const outcome = await step.execute(buildContext({ daemonService, prompt, yes: false }));
    expect(outcome.status).toBe('succeeded');
    expect(daemonService.installCallCount).toBe(1);
  });

  it('installs without prompting in non-interactive mode', async () => {
    const daemonService = new StubDaemonServiceGateway({ initialStatus: { status: 'inactive' } });
    const outcome = await step.execute(buildContext({ daemonService, yes: true }));
    expect(outcome.status).toBe('succeeded');
    expect(daemonService.installCallCount).toBe(1);
  });

  it('blocks with a systemd remediation when installation fails', async () => {
    const daemonService = new StubDaemonServiceGateway({
      initialStatus: { status: 'inactive' },
      installResult: { success: false, requiresSudo: false, error: "Échec d'installation" },
    });
    const outcome = await step.execute(buildContext({ daemonService, yes: true }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.remediation).toContain('systemd');
  });

  it('blocks with a sudo remediation when installation requires elevated rights', async () => {
    const daemonService = new StubDaemonServiceGateway({
      initialStatus: { status: 'inactive' },
      installResult: { success: false, requiresSudo: true, error: 'permission denied' },
    });
    const outcome = await step.execute(buildContext({ daemonService, yes: true }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.remediation).toContain('sudo');
  });

  it('blocks when the daemon installs but never becomes healthy', async () => {
    const daemonService = new StubDaemonServiceGateway({
      initialStatus: { status: 'inactive' },
      installResult: { success: true, requiresSudo: false, error: null },
      healthy: false,
    });
    const outcome = await step.execute(buildContext({ daemonService, yes: true }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('ne répond pas');
  });
});
