import type { VersionCheckResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { VersionCachePort } from '@/modules/cli-configuration/entities/packageVersion/versionCache.gateway.js';

export class VersionCacheMemoryGateway implements VersionCachePort {
  private cachedResult: VersionCheckResult | null = null;
  private lastCheckedAt = 0;
  private readonly ttlMilliseconds: number;

  constructor(ttlMilliseconds: number = 30 * 60 * 1000) {
    this.ttlMilliseconds = ttlMilliseconds;
  }

  get(): VersionCheckResult | null {
    return this.cachedResult;
  }

  set(result: VersionCheckResult): void {
    this.cachedResult = result;
    this.lastCheckedAt = Date.now();
  }

  isExpired(): boolean {
    if (this.cachedResult === null) {
      return true;
    }
    return Date.now() - this.lastCheckedAt > this.ttlMilliseconds;
  }
}
