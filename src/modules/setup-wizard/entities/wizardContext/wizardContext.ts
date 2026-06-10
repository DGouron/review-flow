import type { AiFallbackGateway } from '@/modules/setup-wizard/entities/aiFallback/aiFallback.gateway.js';
import type { ClaudeAuthGateway } from '@/modules/setup-wizard/entities/claudeAuth/claudeAuth.gateway.js';
import type { DaemonHealthProbeGateway } from '@/modules/setup-wizard/entities/daemonHealthProbe/daemonHealthProbe.gateway.js';
import type { DaemonServiceGateway } from '@/modules/setup-wizard/entities/daemonService/daemonService.gateway.js';
import type { DependencyProbeGateway } from '@/modules/setup-wizard/entities/dependencyProbe/dependencyProbe.gateway.js';
import type { EnvFileGateway } from '@/modules/setup-wizard/entities/envFile/envFile.gateway.js';
import type { GitRemoteGateway } from '@/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.js';
import type { ProjectConfigGateway } from '@/modules/setup-wizard/entities/projectConfig/projectConfig.gateway.js';
import type { ProjectContext } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { PromptGateway } from '@/modules/setup-wizard/entities/prompt/prompt.gateway.js';
import type { ServerConfigGateway } from '@/modules/setup-wizard/entities/serverConfig/serverConfig.gateway.js';
import type { SetupStateGateway } from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import type { SkillTemplateGateway } from '@/modules/setup-wizard/entities/skillTemplate/skillTemplate.gateway.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { ValidationGateway } from '@/modules/setup-wizard/entities/validation/validation.gateway.js';
import type { WizardEventEmitter } from '@/modules/setup-wizard/services/wizardEventEmitter.js';

export interface WizardFlags {
  path: string | null;
  json: boolean;
  force: boolean;
  ai: boolean;
  yes: boolean;
  showSecrets: boolean;
}

export interface WizardGateways {
  setupState: SetupStateGateway;
  dependencyProbe: DependencyProbeGateway;
  claudeAuth: ClaudeAuthGateway;
  daemonService: DaemonServiceGateway;
  daemonHealthProbe: DaemonHealthProbeGateway;
  envFile: EnvFileGateway;
  gitRemote: GitRemoteGateway;
  projectConfig: ProjectConfigGateway;
  skillTemplate: SkillTemplateGateway;
  serverConfig: ServerConfigGateway;
  validation: ValidationGateway;
  aiFallback: AiFallbackGateway;
  prompt: PromptGateway;
}

export interface WizardContext {
  state: SetupState | null;
  currentStepId: StepId | null;
  project: ProjectContext;
  flags: WizardFlags;
  gateways: WizardGateways;
  emitter: WizardEventEmitter;
  now: () => Date;
}
