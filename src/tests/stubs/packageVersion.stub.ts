import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js';

export class StubPackageVersionGateway implements PackageVersionGateway {
  private readonly latestVersion: string | null;

  constructor(latestVersion: string | null = null) {
    this.latestVersion = latestVersion;
  }

  async fetchLatestVersion(): Promise<string | null> {
    return this.latestVersion;
  }
}
