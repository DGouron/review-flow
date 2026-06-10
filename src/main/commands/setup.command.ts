import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LineReader } from '@/modules/setup-wizard/entities/lineReader/lineReader.gateway.js';
import type { PromptGateway } from '@/modules/setup-wizard/entities/prompt/prompt.gateway.js';
import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import type {
  WizardContext,
  WizardGateways,
} from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { AiFallbackNoopGateway } from '@/modules/setup-wizard/interface-adapters/gateways/aiFallback.noop.gateway.js';
import { ClaudeAuthCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/claudeAuth.cli.gateway.js';
import { DaemonHealthProbeHttpGateway } from '@/modules/setup-wizard/interface-adapters/gateways/daemonHealthProbe.http.gateway.js';
import { DaemonServiceSystemdGateway } from '@/modules/setup-wizard/interface-adapters/gateways/daemonService.systemd.gateway.js';
import { DependencyProbeCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/dependencyProbe.cli.gateway.js';
import { EnvFileFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/envFile.fileSystem.gateway.js';
import { GitRemoteCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.js';
import { NodeStdinLineReader } from '@/modules/setup-wizard/interface-adapters/gateways/lineReader.stdin.gateway.js';
import { ProjectConfigFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/projectConfig.fileSystem.gateway.js';
import { PromptStdinJsonGateway } from '@/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.js';
import { PromptTtyGateway } from '@/modules/setup-wizard/interface-adapters/gateways/prompt.tty.gateway.js';
import { ServerConfigFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/serverConfig.fileSystem.gateway.js';
import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { SkillTemplateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/skillTemplate.fileSystem.gateway.js';
import { ValidationAdapterGateway } from '@/modules/setup-wizard/interface-adapters/gateways/validation.adapter.gateway.js';
import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';
import { HumanWizardEventEmitter } from '@/modules/setup-wizard/services/humanWizardEventEmitter.js';
import { JsonWizardEventEmitter } from '@/modules/setup-wizard/services/jsonWizardEventEmitter.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';
import { OrchestrateSetupUseCase } from '@/modules/setup-wizard/usecases/orchestrateSetup.usecase.js';
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
import { getConfigDir } from '@/shared/services/configDir.js';

const DEFAULT_DAEMON_PORT = 3847;
const STATE_FILENAME = 'setup-state.json';

export interface SetupCliArgs {
  path: string | undefined;
  json: boolean;
  force: boolean;
  ai: boolean;
  yes: boolean;
  showSecrets: boolean;
}

export interface SetupDependencies {
  buildSteps: () => SetupStep[];
  buildGateways: (args: SetupCliArgs) => WizardGateways;
  buildEmitter: (args: SetupCliArgs, write: (line: string) => void) => WizardEventEmitter;
  buildLineReader: () => LineReader;
  resolveProjectPath: (args: SetupCliArgs) => string | null;
  log: (line: string) => void;
  exit: (code: number) => void;
  now: () => Date;
}

function buildStdinPromptGateway(
  emitter: WizardEventEmitter,
  context: WizardContext,
  deps: SetupDependencies,
): PromptGateway {
  return new PromptStdinJsonGateway({
    lineReader: deps.buildLineReader(),
    emitter,
    currentStepId: () => context.currentStepId ?? 'dependencies',
    isNonInteractive: () => context.flags.yes,
  });
}

export async function executeSetup(args: SetupCliArgs, deps: SetupDependencies): Promise<void> {
  const projectPath = deps.resolveProjectPath(args);
  const gateways = deps.buildGateways(args);
  const emitter = deps.buildEmitter(args, deps.log);

  const context: WizardContext = {
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
      json: args.json,
      force: args.force,
      ai: args.ai,
      yes: args.yes,
      showSecrets: args.showSecrets,
    },
    gateways,
    emitter,
    now: deps.now,
  };

  if (args.json) {
    context.gateways.prompt = buildStdinPromptGateway(emitter, context, deps);
  }

  const orchestrator = new OrchestrateSetupUseCase();
  const result = await orchestrator.execute({ context, steps: deps.buildSteps() });
  deps.exit(result.exitCode);
}

function resolveMcpServerPath(): string {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcpServer.js');
  } catch {
    return 'mcpServer.js';
  }
}

export function createSetupDependencies(): SetupDependencies {
  const configDir = getConfigDir();
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
    buildGateways: (_args) => {
      const healthProbe = new DaemonHealthProbeHttpGateway();
      return {
        setupState: new SetupStateFileSystemGateway({ filePath: join(configDir, STATE_FILENAME) }),
        dependencyProbe: new DependencyProbeCliGateway(),
        claudeAuth: new ClaudeAuthCliGateway(),
        daemonService: new DaemonServiceSystemdGateway({
          healthProbe,
          port: DEFAULT_DAEMON_PORT,
        }),
        daemonHealthProbe: healthProbe,
        envFile: new EnvFileFileSystemGateway(),
        gitRemote: new GitRemoteCliGateway(),
        projectConfig: new ProjectConfigFileSystemGateway(),
        skillTemplate: new SkillTemplateFileSystemGateway({
          mcpServerPath: resolveMcpServerPath(),
        }),
        serverConfig: new ServerConfigFileSystemGateway({
          configPath: join(configDir, 'config.json'),
        }),
        validation: new ValidationAdapterGateway({
          configPath: join(configDir, 'config.json'),
          envPath: join(configDir, '.env'),
        }),
        aiFallback: new AiFallbackNoopGateway(),
        prompt: new PromptTtyGateway(),
      };
    },
    buildEmitter: (args, write) =>
      args.json ? new JsonWizardEventEmitter(write) : new HumanWizardEventEmitter(write),
    buildLineReader: () => new NodeStdinLineReader(),
    resolveProjectPath: (args) => args.path ?? process.cwd(),
    log: (line) => console.log(line),
    exit: (code) => process.exit(code),
    now: () => new Date(),
  };
}
