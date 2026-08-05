import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js';
import type {
  VersionCheckResult,
  SelfUpdateResult,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';
import type { VersionCachePort } from '@/modules/cli-configuration/entities/packageVersion/versionCache.gateway.js';
import type { QueueActivityGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.js';
import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';
import type {
  CheckVersionInput,
  CheckVersionDependencies,
} from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js';
import type {
  TriggerSelfUpdateInput,
  TriggerSelfUpdateDependencies,
} from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';

interface VersionRoutesOptions {
  checkVersion: (
    input: CheckVersionInput,
    dependencies: CheckVersionDependencies,
  ) => Promise<VersionCheckResult>;
  triggerSelfUpdate: (
    input: TriggerSelfUpdateInput,
    dependencies: TriggerSelfUpdateDependencies,
  ) => Promise<SelfUpdateResult>;
  currentVersion: string;
  packageVersionGateway: PackageVersionGateway;
  versionCache: VersionCachePort;
  selfUpdateCommand: SelfUpdateCommandPort;
  installTypeDetector: InstallTypeDetector;
  serverPort: number;
  queueActivityGateway: QueueActivityGateway;
  sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway;
}

async function restartDaemonSilently(
  selfUpdateCommand: SelfUpdateCommandPort,
  serverPort: number,
): Promise<void> {
  try {
    await selfUpdateCommand.restartDaemon(serverPort);
  } catch {
    return;
  }
}

async function handleSelfUpdateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: VersionRoutesOptions,
): Promise<SelfUpdateResult> {
  const result = await options.triggerSelfUpdate(
    { requestOrigin: request.ip },
    {
      selfUpdateCommand: options.selfUpdateCommand,
      installTypeDetector: options.installTypeDetector,
      queueActivityGateway: options.queueActivityGateway,
      sourceCheckoutUpdateGateway: options.sourceCheckoutUpdateGateway,
    },
  );

  if (result.status === 'failed') {
    reply.code(500);
  }

  if (result.status === 'permission-denied') {
    reply.code(403);
  }

  if (result.status === 'started') {
    setTimeout(() => {
      void restartDaemonSilently(options.selfUpdateCommand, options.serverPort);
    }, 1000);
  }

  return result;
}

export const versionRoutes: FastifyPluginAsync<VersionRoutesOptions> = async (fastify, options) => {
  fastify.get('/api/version/check', async () => {
    return options.checkVersion(
      { currentVersion: options.currentVersion, forceRefresh: true },
      {
        packageVersionGateway: options.packageVersionGateway,
        cache: options.versionCache,
        installTypeDetector: options.installTypeDetector,
      },
    );
  });

  fastify.post('/api/version/update', async (request, reply) =>
    handleSelfUpdateRequest(request, reply, options),
  );
};
