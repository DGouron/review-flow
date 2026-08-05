import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';
import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';

export class StubInstallTypeDetector implements InstallTypeDetector {
  private readonly value: InstallType;
  calls = 0;

  constructor(value: InstallType = 'global-npm') {
    this.value = value;
  }

  detect(): InstallType {
    this.calls += 1;
    return this.value;
  }
}
