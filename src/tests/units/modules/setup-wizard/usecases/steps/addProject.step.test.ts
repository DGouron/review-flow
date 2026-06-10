import { describe, it, expect } from 'vitest';

import type { GitRemoteGateway } from '@/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { AddProjectStep } from '@/modules/setup-wizard/usecases/steps/addProject.step.js';
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

interface ContextOptions {
  prompt?: StubPromptGateway;
  yes?: boolean;
  ai?: boolean;
  aiAvailable?: boolean;
  projectPath?: string;
}

function noopStateGateway(): SetupStateGateway {
  return {
    load: () => ({ state: null, corrupted: false }),
    save: () => undefined,
    reset: () => undefined,
  };
}

function buildContext(gitRemote: GitRemoteGateway, options: ContextOptions = {}): WizardContext {
  const projectPath = options.projectPath ?? '/tmp/p';
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
      json: false,
      force: false,
      ai: options.ai ?? false,
      yes: options.yes ?? false,
      showSecrets: false,
    },
    gateways: {
      setupState: noopStateGateway(),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
      gitRemote,
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway({ available: options.aiAvailable ?? false }),
      prompt: options.prompt ?? new StubPromptGateway(),
    },
    emitter: new HumanWizardEventEmitter(() => undefined),
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('AddProjectStep', () => {
  const step = new AddProjectStep();

  it('accepts a valid github repo with origin remote', async () => {
    const gitRemote = new StubGitRemoteGateway({
      projectPath: '/tmp/p',
      isRepo: true,
      remoteUrl: 'git@github.com:org/repo.git',
      platform: 'github',
    });
    const context = buildContext(gitRemote);
    const outcome = await step.execute(context);
    expect(outcome.status).toBe('succeeded');
    expect(context.project.platform).toBe('github');
  });

  it('blocks when path is not a git repo', async () => {
    const gitRemote = new StubGitRemoteGateway({ projectPath: '/tmp/p', isRepo: false });
    const outcome = await step.execute(buildContext(gitRemote));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('dépôt git');
  });

  it('blocks when no origin remote is configured', async () => {
    const gitRemote = new StubGitRemoteGateway({ projectPath: '/tmp/p', remoteUrl: null });
    const outcome = await step.execute(buildContext(gitRemote));
    expect(outcome.status).toBe('blocked');
    expect(outcome.message).toContain('remote');
  });

  it('detects gitlab platform from remote url', async () => {
    const gitRemote = new StubGitRemoteGateway({
      projectPath: '/tmp/p',
      remoteUrl: 'git@gitlab.com:org/repo.git',
      platform: 'gitlab',
    });
    const context = buildContext(gitRemote);
    const outcome = await step.execute(context);
    expect(outcome.status).toBe('succeeded');
    expect(context.project.platform).toBe('gitlab');
  });

  it('prompts user when platform is ambiguous', async () => {
    const gitRemote = new StubGitRemoteGateway({
      projectPath: '/tmp/p',
      remoteUrl: 'git@custom.com:repo.git',
      platform: 'unknown',
    });
    const prompt = new StubPromptGateway();
    prompt.queueChoice('gitlab');
    const outcome = await step.execute(buildContext(gitRemote, { prompt }));
    expect(outcome.status).toBe('succeeded');
  });

  it('blocks under -y when platform is ambiguous', async () => {
    const gitRemote = new StubGitRemoteGateway({
      projectPath: '/tmp/p',
      remoteUrl: 'git@custom.com:repo.git',
      platform: 'unknown',
    });
    const outcome = await step.execute(buildContext(gitRemote, { yes: true }));
    expect(outcome.status).toBe('blocked');
  });
});
