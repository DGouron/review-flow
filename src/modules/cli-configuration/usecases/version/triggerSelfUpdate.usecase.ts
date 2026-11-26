import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js';
import type { SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';
import type { QueueActivityGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.js';
import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';
import { runSourceCheckoutSelfUpdate } from '@/modules/cli-configuration/usecases/version/runSourceCheckoutSelfUpdate.usecase.js';

export interface TriggerSelfUpdateDependencies {
  selfUpdateCommand: SelfUpdateCommandPort;
  installTypeDetector: InstallTypeDetector;
  queueActivityGateway: QueueActivityGateway;
  sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway;
  packageVersionGateway: PackageVersionGateway;
}

async function triggerGlobalNpmUpdate(
  selfUpdateCommand: SelfUpdateCommandPort,
  packageVersionGateway: PackageVersionGateway,
): Promise<SelfUpdateResult> {
  const targetVersion = await packageVersionGateway.fetchLatestVersion();
  if (targetVersion === null) {
    return { status: 'refused', motive: { kind: 'latest-version-unavailable' } };
  }

  const installOutcome = await selfUpdateCommand.installGlobalVersion(targetVersion);
  switch (installOutcome.kind) {
    case 'permission-denied':
      return {
        status: 'permission-denied',
        command: `sudo npm install -g reviewflow@${targetVersion}`,
      };
    case 'version-not-on-registry':
      return {
        status: 'refused',
        motive: { kind: 'version-not-on-registry', version: targetVersion },
      };
    case 'failed':
      return { status: 'failed', error: installOutcome.error };
    case 'installed':
      break;
  }

  const installedVersion = await selfUpdateCommand.readInstalledVersion();
  if (installedVersion !== targetVersion) {
    return {
      status: 'refused',
      motive: { kind: 'install-not-applied', expectedVersion: targetVersion, installedVersion },
    };
  }

  return { status: 'started' };
}

export async function triggerSelfUpdate(
  dependencies: TriggerSelfUpdateDependencies,
): Promise<SelfUpdateResult> {
  const {
    selfUpdateCommand,
    installTypeDetector,
    queueActivityGateway,
    sourceCheckoutUpdateGateway,
    packageVersionGateway,
  } = dependencies;

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

  return triggerGlobalNpmUpdate(selfUpdateCommand, packageVersionGateway);
}
