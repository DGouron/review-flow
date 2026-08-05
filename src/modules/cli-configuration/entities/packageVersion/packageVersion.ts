import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';
import type { SelfUpdateRefusalMotive } from '@/modules/cli-configuration/entities/selfUpdateSequence/selfUpdateRefusalMotive.js';

export type VersionCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  installType: InstallType;
};

export type SelfUpdateResult =
  | { status: 'started' }
  | { status: 'updated'; previousVersion: string; newVersion: string }
  | { status: 'failed'; error: string }
  | { status: 'permission-denied'; command: string }
  | { status: 'refused'; motive: SelfUpdateRefusalMotive };

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'updating'
  | 'restarting'
  | 'failed'
  | 'manual-required';
