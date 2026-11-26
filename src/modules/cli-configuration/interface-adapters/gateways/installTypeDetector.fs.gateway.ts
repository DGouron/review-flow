import { fileURLToPath } from 'node:url';

import type { InstallType } from '@/modules/cli-configuration/entities/packageVersion/installType.js';
import type { InstallTypeDetector } from '@/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.js';
import { findReviewflowCheckoutRoot } from '@/modules/cli-configuration/interface-adapters/gateways/reviewflowCheckoutRoot.fs.js';

function defaultStartPath(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

export class InstallTypeDetectorFsGateway implements InstallTypeDetector {
  private readonly startPath: string;

  constructor(startPath: string = defaultStartPath()) {
    this.startPath = startPath;
  }

  detect(): InstallType {
    return findReviewflowCheckoutRoot(this.startPath) === null ? 'global-npm' : 'source-checkout';
  }
}
