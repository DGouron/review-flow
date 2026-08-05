import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import type { SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';
import { isLocalOrigin } from '@/modules/cli-configuration/entities/selfUpdateSequence/localOrigin.js';
import type { QueueActivityGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.js';
import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';
import { runSourceCheckoutSelfUpdate } from '@/modules/cli-configuration/usecases/version/runSourceCheckoutSelfUpdate.usecase.js';

export interface TriggerSelfUpdateInput {
  requestOrigin: string;
}

export interface TriggerSelfUpdateDependencies {
  selfUpdateCommand: SelfUpdateCommandPort;
  installTypeDetector: InstallTypeDetector;
  queueActivityGateway: QueueActivityGateway;
  sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway;
}

async function triggerGlobalNpmUpdate(
  selfUpdateCommand: SelfUpdateCommandPort,
): Promise<SelfUpdateResult> {
  const updateResult = await selfUpdateCommand.runGlobalUpdate();

  if (updateResult.success) {
    return { status: 'started' };
  }

  if (updateResult.permissionDenied) {
    return { status: 'permission-denied', command: 'sudo npm update -g reviewflow' };
  }

  return { status: 'failed', error: updateResult.error ?? 'Unknown error' };
}

export async function triggerSelfUpdate(
  input: TriggerSelfUpdateInput,
  dependencies: TriggerSelfUpdateDependencies,
): Promise<SelfUpdateResult> {
  const {
    selfUpdateCommand,
    installTypeDetector,
    queueActivityGateway,
    sourceCheckoutUpdateGateway,
  } = dependencies;

  if (!isLocalOrigin(input.requestOrigin)) {
    return { status: 'refused', motive: { kind: 'local-only' } };
  }

  const activeOrWaitingCount = queueActivityGateway.countActiveOrWaiting();
  if (activeOrWaitingCount > 0) {
    return {
      status: 'refused',
      motive: { kind: 'reviews-in-progress', count: activeOrWaitingCount },
    };
  }

  if (installTypeDetector.detect() === 'source-checkout') {
    return runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });
  }

  return triggerGlobalNpmUpdate(selfUpdateCommand);
}
