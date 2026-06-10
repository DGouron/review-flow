import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';

export interface InstallTypeDetector {
  detect(): InstallType;
}
