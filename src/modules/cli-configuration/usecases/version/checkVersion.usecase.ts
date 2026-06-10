import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js';
import type { VersionCheckResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { VersionCachePort } from '@/modules/cli-configuration/entities/packageVersion/versionCache.gateway.js';

export interface CheckVersionDependencies {
  packageVersionGateway: PackageVersionGateway;
  cache: VersionCachePort;
  installTypeDetector: InstallTypeDetector;
}

export interface CheckVersionInput {
  currentVersion: string;
  forceRefresh: boolean;
}

export async function checkVersion(
  input: CheckVersionInput,
  dependencies: CheckVersionDependencies,
): Promise<VersionCheckResult> {
  const { cache, installTypeDetector } = dependencies;

  if (!input.forceRefresh && !cache.isExpired()) {
    const cached = cache.get();
    if (cached !== null) {
      return cached;
    }
  }

  const latestVersion = await dependencies.packageVersionGateway.fetchLatestVersion();
  const updateAvailable = latestVersion !== null && latestVersion !== input.currentVersion;

  const result: VersionCheckResult = {
    currentVersion: input.currentVersion,
    latestVersion,
    updateAvailable,
    checkedAt: new Date().toISOString(),
    installType: installTypeDetector.detect(),
  };

  cache.set(result);

  return result;
}
