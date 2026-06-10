import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';
import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';

function defaultStartPath(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

export class InstallTypeDetectorFsGateway implements InstallTypeDetector {
  private readonly startPath: string;

  constructor(startPath: string = defaultStartPath()) {
    this.startPath = startPath;
  }

  detect(): InstallType {
    let current = this.startPath;
    while (true) {
      if (existsSync(join(current, '.git'))) {
        return 'source-checkout';
      }
      const parent = dirname(current);
      if (parent === current) {
        return 'global-npm';
      }
      current = parent;
    }
  }
}
