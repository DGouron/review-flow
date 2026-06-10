import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import type { SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';

export const SOURCE_CHECKOUT_MANUAL_COMMAND =
  'git pull && yarn build && systemctl --user restart reviewflow-app';

export interface TriggerSelfUpdateDependencies {
  selfUpdateCommand: SelfUpdateCommandPort;
  installTypeDetector: InstallTypeDetector;
}

export async function triggerSelfUpdate(
  dependencies: TriggerSelfUpdateDependencies,
): Promise<SelfUpdateResult> {
  const { selfUpdateCommand, installTypeDetector } = dependencies;

  if (installTypeDetector.detect() === 'source-checkout') {
    return { status: 'source-checkout', manualCommand: SOURCE_CHECKOUT_MANUAL_COMMAND };
  }

  const updateResult = await selfUpdateCommand.runGlobalUpdate();

  if (updateResult.success) {
    return { status: 'started' };
  }

  if (updateResult.permissionDenied) {
    return { status: 'permission-denied', command: 'sudo npm update -g reviewflow' };
  }

  return { status: 'failed', error: updateResult.error ?? 'Unknown error' };
}
