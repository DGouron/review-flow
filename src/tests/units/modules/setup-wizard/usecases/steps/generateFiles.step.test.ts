import { describe, it, expect } from 'vitest';

import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { GenerateFilesStep } from '@/modules/setup-wizard/usecases/steps/generateFiles.step.js';
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
  options: {
    projectConfig?: StubProjectConfigGateway;
    skillTemplate?: StubSkillTemplateGateway;
    force?: boolean;
  } = {},
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
    flags: {
      path: '/tmp/p',
      json: false,
      force: options.force ?? false,
      ai: false,
      yes: false,
      showSecrets: false,
    },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
      gitRemote: new StubGitRemoteGateway({ projectPath: '/tmp/p' }),
      projectConfig: options.projectConfig ?? new StubProjectConfigGateway(),
      skillTemplate: options.skillTemplate ?? new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt: new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('GenerateFilesStep', () => {
  const step = new GenerateFilesStep();

  it('writes config + 2 skills + mcp.json on a fresh project', async () => {
    const projectConfig = new StubProjectConfigGateway();
    const skillTemplate = new StubSkillTemplateGateway();
    const outcome = await step.execute(buildContext({ projectConfig, skillTemplate }));
    expect(outcome.status).toBe('succeeded');
    expect(projectConfig.writeCallCount).toBe(1);
    expect(skillTemplate.skills).toHaveLength(2);
    expect(skillTemplate.mcpJsonWrites).toHaveLength(1);
  });

  it('blocks when project config exists and --force is not set', async () => {
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.seedExisting('/tmp/p');
    const outcome = await step.execute(buildContext({ projectConfig }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('existante');
  });

  it('backs up and rewrites when project config exists and --force is set', async () => {
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.seedExisting('/tmp/p');
    const outcome = await step.execute(buildContext({ projectConfig, force: true }));
    expect(outcome.status).toBe('succeeded');
    expect(projectConfig.backupCallCount).toBe(1);
    expect(projectConfig.writeCallCount).toBe(1);
  });

  it('blocks with permission-denied remediation when write throws EACCES', async () => {
    const projectConfig = new StubProjectConfigGateway();
    projectConfig.failNextWrite = true;
    const outcome = await step.execute(buildContext({ projectConfig }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('permissions');
  });
});
