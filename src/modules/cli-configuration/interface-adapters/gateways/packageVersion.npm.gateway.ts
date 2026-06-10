import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js';
import { safeParseNpmRegistryResponse } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.guard.js';

export class NpmPackageVersionGateway implements PackageVersionGateway {
  private readonly registryUrl: string;

  constructor(packageName = 'reviewflow') {
    this.registryUrl = `https://registry.npmjs.org/${packageName}/latest`;
  }

  async fetchLatestVersion(): Promise<string | null> {
    try {
      const response = await fetch(this.registryUrl);

      if (!response.ok) {
        return null;
      }

      const data: unknown = await response.json();
      const parsed = safeParseNpmRegistryResponse(data);

      if (!parsed.success) {
        return null;
      }

      return parsed.data.version;
    } catch {
      return null;
    }
  }
}
