import type { VersionCheckResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { NpmRegistryResponse } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.schema.js';

export class PackageVersionFactory {
  static createVersionCheckResult(overrides?: Partial<VersionCheckResult>): VersionCheckResult {
    return {
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: true,
      checkedAt: '2026-03-14T10:00:00Z',
      installType: 'global-npm',
      ...overrides,
    };
  }

  static createNpmRegistryResponse(overrides?: Partial<NpmRegistryResponse>): NpmRegistryResponse {
    return {
      version: '2.0.0',
      ...overrides,
    };
  }
}
