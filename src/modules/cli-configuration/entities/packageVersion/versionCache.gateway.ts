import type { VersionCheckResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';

export interface VersionCachePort {
  get(): VersionCheckResult | null;
  set(result: VersionCheckResult): void;
  isExpired(): boolean;
}
