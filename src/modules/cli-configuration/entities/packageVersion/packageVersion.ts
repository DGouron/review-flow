import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';

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
  | { status: 'source-checkout'; manualCommand: string };

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'updating'
  | 'restarting'
  | 'failed'
  | 'manual-required';
