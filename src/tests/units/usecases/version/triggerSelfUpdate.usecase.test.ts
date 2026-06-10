import { describe, it, expect } from 'vitest';

import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { StubInstallTypeDetector } from '@/tests/stubs/installTypeDetector.stub.js';
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';

const globalNpm = new StubInstallTypeDetector('global-npm');

describe('triggerSelfUpdate usecase', () => {
  it('should return started when update succeeds', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(true);

    const result = await triggerSelfUpdate({ selfUpdateCommand, installTypeDetector: globalNpm });

    expect(result).toEqual({ status: 'started' });
  });

  it('should return failed with error message when update fails', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(false, 'npm update failed');

    const result = await triggerSelfUpdate({ selfUpdateCommand, installTypeDetector: globalNpm });

    expect(result).toEqual({ status: 'failed', error: 'npm update failed' });
  });

  it('should return failed with default error when no error message provided', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(false);

    const result = await triggerSelfUpdate({ selfUpdateCommand, installTypeDetector: globalNpm });

    expect(result).toEqual({ status: 'failed', error: 'Unknown error' });
  });

  it('should return permission-denied with command when permission is denied', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(false, 'EACCES', true);

    const result = await triggerSelfUpdate({ selfUpdateCommand, installTypeDetector: globalNpm });

    expect(result).toEqual({
      status: 'permission-denied',
      command: 'sudo npm update -g reviewflow',
    });
  });

  it('should short-circuit with source-checkout status and manual command when running from a source checkout', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(true);
    const sourceCheckout = new StubInstallTypeDetector('source-checkout');

    const result = await triggerSelfUpdate({
      selfUpdateCommand,
      installTypeDetector: sourceCheckout,
    });

    expect(result).toEqual({
      status: 'source-checkout',
      manualCommand: 'git pull && yarn build && systemctl --user restart reviewflow-app',
    });
  });
});
