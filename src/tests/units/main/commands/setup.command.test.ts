import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  executeSetup,
  type SetupDependencies,
  type SetupCliArgs,
} from '@/main/commands/setup.command.js';
import type { LineReader } from '@/modules/setup-wizard/entities/lineReader/lineReader.gateway.js';
import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { JsonWizardEventEmitter } from '@/modules/setup-wizard/services/jsonWizardEventEmitter.js';
import { AddProjectStep } from '@/modules/setup-wizard/usecases/steps/addProject.step.js';
import { CheckDependenciesStep } from '@/modules/setup-wizard/usecases/steps/checkDependencies.step.js';
import { ClaudeLoginStep } from '@/modules/setup-wizard/usecases/steps/claudeLogin.step.js';
import { ConfigurePipelineStep } from '@/modules/setup-wizard/usecases/steps/configurePipeline.step.js';
import { DaemonInstallStep } from '@/modules/setup-wizard/usecases/steps/daemonInstall.step.js';
import { DisplayNextActionsStep } from '@/modules/setup-wizard/usecases/steps/displayNextActions.step.js';
import { GenerateFilesStep } from '@/modules/setup-wizard/usecases/steps/generateFiles.step.js';
import { GenerateSecretsStep } from '@/modules/setup-wizard/usecases/steps/generateSecrets.step.js';
import { RegisterProjectStep } from '@/modules/setup-wizard/usecases/steps/registerProject.step.js';
import { ValidateSetupStep } from '@/modules/setup-wizard/usecases/steps/validateSetup.step.js';
import { StubAiFallbackGateway } from '@/tests/stubs/setup-wizard/aiFallback.stub.js';
import { StubClaudeAuthGateway } from '@/tests/stubs/setup-wizard/claudeAuth.stub.js';
import { StubDaemonHealthProbeGateway } from '@/tests/stubs/setup-wizard/daemonHealthProbe.stub.js';
import { StubDaemonServiceGateway } from '@/tests/stubs/setup-wizard/daemonService.stub.js';
import { StubDependencyProbeGateway } from '@/tests/stubs/setup-wizard/dependencyProbe.stub.js';
import { StubEnvFileGateway } from '@/tests/stubs/setup-wizard/envFile.stub.js';
import { StubGitRemoteGateway } from '@/tests/stubs/setup-wizard/gitRemote.stub.js';
import { StubLineReader } from '@/tests/stubs/setup-wizard/lineReader.stub.js';
import { StubProjectConfigGateway } from '@/tests/stubs/setup-wizard/projectConfig.stub.js';
import { StubPromptGateway } from '@/tests/stubs/setup-wizard/prompt.stub.js';
import { StubServerConfigGateway } from '@/tests/stubs/setup-wizard/serverConfig.stub.js';
import { StubSkillTemplateGateway } from '@/tests/stubs/setup-wizard/skillTemplate.stub.js';
import { StubValidationGateway } from '@/tests/stubs/setup-wizard/validation.stub.js';

function buildDependencies(
  rootDir: string,
  projectPath: string,
  log: (line: string) => void,
  exitCodes: number[],
  buildLineReader: () => LineReader = () => new StubLineReader([]),
): SetupDependencies {
  return {
    buildSteps: () => [
      new CheckDependenciesStep(),
      new ClaudeLoginStep(),
      new DaemonInstallStep(),
      new GenerateSecretsStep(),
      new AddProjectStep(),
      new ConfigurePipelineStep(),
      new GenerateFilesStep(),
      new RegisterProjectStep(),
      new ValidateSetupStep(),
      new DisplayNextActionsStep(new NextActionsPresenter()),
    ],
    buildGateways: () => ({
      setupState: new SetupStateFileSystemGateway({ filePath: join(rootDir, 'setup-state.json') }),
      dependencyProbe: new StubDependencyProbeGateway(),
      claudeAuth: new StubClaudeAuthGateway(),
      daemonService: new StubDaemonServiceGateway(),
      daemonHealthProbe: new StubDaemonHealthProbeGateway(),
      envFile: new StubEnvFileGateway(),
      gitRemote: new StubGitRemoteGateway({
        projectPath,
        platform: 'github',
        remoteUrl: 'git@github.com:org/repo.git',
      }),
      projectConfig: new StubProjectConfigGateway(),
      skillTemplate: new StubSkillTemplateGateway(),
      serverConfig: new StubServerConfigGateway(),
      validation: new StubValidationGateway(),
      aiFallback: new StubAiFallbackGateway(),
      prompt: new StubPromptGateway(),
    }),
    buildEmitter: (args, write) =>
      args.json ? new JsonWizardEventEmitter(write) : new HumanWizardEventEmitter(write),
    buildLineReader,
    resolveProjectPath: (args) => args.path ?? projectPath,
    log,
    exit: (code) => {
      exitCodes.push(code);
    },
    now: () => new Date('2026-05-28T10:00:00.000Z'),
  };
}

describe('executeSetup', () => {
  it('runs the wizard end-to-end with stubs and exits with code 0', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-cmd-'));
    try {
      const projectPath = join(rootDir, 'project');
      const lines: string[] = [];
      const exitCodes: number[] = [];
      const args: SetupCliArgs = {
        path: projectPath,
        json: false,
        force: false,
        ai: false,
        yes: false,
        showSecrets: false,
      };
      await executeSetup(
        args,
        buildDependencies(rootDir, projectPath, (line) => lines.push(line), exitCodes),
      );
      expect(exitCodes).toEqual([0]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('never builds a line reader in human (non-JSON) mode', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-cmd-tty-'));
    try {
      const projectPath = join(rootDir, 'project');
      const exitCodes: number[] = [];
      let lineReaderBuilt = 0;
      const args: SetupCliArgs = {
        path: projectPath,
        json: false,
        force: false,
        ai: false,
        yes: false,
        showSecrets: false,
      };
      const deps = buildDependencies(
        rootDir,
        projectPath,
        () => undefined,
        exitCodes,
        () => {
          lineReaderBuilt++;
          return new StubLineReader([]);
        },
      );

      await executeSetup(args, deps);

      expect(lineReaderBuilt).toBe(0);
      expect(exitCodes).toEqual([0]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('builds a line reader in --json mode', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-cmd-json-reader-'));
    try {
      const projectPath = join(rootDir, 'project');
      const exitCodes: number[] = [];
      let lineReaderBuilt = 0;
      const args: SetupCliArgs = {
        path: projectPath,
        json: true,
        force: false,
        ai: false,
        yes: false,
        showSecrets: false,
      };
      const deps = buildDependencies(
        rootDir,
        projectPath,
        () => undefined,
        exitCodes,
        () => {
          lineReaderBuilt++;
          return new StubLineReader([]);
        },
      );

      await executeSetup(args, deps);

      expect(lineReaderBuilt).toBe(1);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('emits JSON event lines under --json mode', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'reviewflow-setup-cmd-json-'));
    try {
      const projectPath = join(rootDir, 'project');
      const lines: string[] = [];
      const exitCodes: number[] = [];
      const args: SetupCliArgs = {
        path: projectPath,
        json: true,
        force: false,
        ai: false,
        yes: false,
        showSecrets: false,
      };
      await executeSetup(
        args,
        buildDependencies(rootDir, projectPath, (line) => lines.push(line), exitCodes),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
