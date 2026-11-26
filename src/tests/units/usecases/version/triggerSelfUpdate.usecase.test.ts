import { describe, it, expect } from 'vitest';

import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { StubInstallTypeDetector } from '@/tests/stubs/installTypeDetector.stub.js';
import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js';
import { StubQueueActivity } from '@/tests/stubs/queueActivity.stub.js';
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';
import { StubSourceCheckoutUpdate } from '@/tests/stubs/sourceCheckoutUpdate.stub.js';

const LATEST_VERSION = '3.57.0';

function globalNpmDependencies(
  selfUpdateCommand: StubSelfUpdateCommand,
  latestVersion: string | null = LATEST_VERSION,
) {
  return {
    selfUpdateCommand,
    installTypeDetector: new StubInstallTypeDetector('global-npm'),
    queueActivityGateway: new StubQueueActivity(0),
    sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
    packageVersionGateway: new StubPackageVersionGateway(latestVersion),
  };
}

describe('triggerSelfUpdate usecase', () => {
  describe('global-npm install', () => {
    it('should install the latest published version explicitly', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand();

      await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(selfUpdateCommand.requestedVersion).toBe(LATEST_VERSION);
    });

    it('should return started once the latest version is the one installed', async () => {
      const result = await triggerSelfUpdate(globalNpmDependencies(new StubSelfUpdateCommand()));

      expect(result).toEqual({ status: 'started' });
    });

    it('scenario #448: npm exits successfully but the installed version did not change — refuses instead of restarting', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({
        installedVersionAfterInstall: '3.56.2',
      });

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(result).toEqual({
        status: 'refused',
        motive: {
          kind: 'install-not-applied',
          expectedVersion: LATEST_VERSION,
          installedVersion: '3.56.2',
        },
      });
    });

    it('should refuse when the installed version cannot be read back', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({ installedVersionAfterInstall: null });

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(result).toEqual({
        status: 'refused',
        motive: {
          kind: 'install-not-applied',
          expectedVersion: LATEST_VERSION,
          installedVersion: null,
        },
      });
    });

    it('should refuse without installing when the latest version cannot be fetched from the registry', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand();

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand, null));

      expect(result).toEqual({ status: 'refused', motive: { kind: 'latest-version-unavailable' } });
      expect(selfUpdateCommand.requestedVersion).toBeNull();
    });

    it('should refuse when npm does not find the version on the registry yet', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({
        installOutcome: { kind: 'version-not-on-registry' },
      });

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'version-not-on-registry', version: LATEST_VERSION },
      });
    });

    it('should return failed with the npm error when the install fails', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({
        installOutcome: { kind: 'failed', error: 'npm install failed' },
      });

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(result).toEqual({ status: 'failed', error: 'npm install failed' });
    });

    it('should return permission-denied with the exact manual command when permission is denied', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({
        installOutcome: { kind: 'permission-denied' },
      });

      const result = await triggerSelfUpdate(globalNpmDependencies(selfUpdateCommand));

      expect(result).toEqual({
        status: 'permission-denied',
        command: `sudo npm install -g reviewflow@${LATEST_VERSION}`,
      });
    });

    it('scenario: global install, review running — refuses with the running count', async () => {
      const result = await triggerSelfUpdate({
        ...globalNpmDependencies(new StubSelfUpdateCommand()),
        queueActivityGateway: new StubQueueActivity(1),
      });

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 1 },
      });
    });
  });

  describe('source-checkout install', () => {
    it('should delegate to the source-checkout sequence and return started', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand({
        installOutcome: { kind: 'permission-denied' },
      });

      const result = await triggerSelfUpdate({
        selfUpdateCommand,
        installTypeDetector: new StubInstallTypeDetector('source-checkout'),
        queueActivityGateway: new StubQueueActivity(0),
        sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        packageVersionGateway: new StubPackageVersionGateway('3.57.0'),
      });

      expect(result).toEqual({ status: 'started' });
    });

    it('should propagate a refusal motive produced by the source-checkout sequence', async () => {
      const result = await triggerSelfUpdate({
        selfUpdateCommand: new StubSelfUpdateCommand(),
        installTypeDetector: new StubInstallTypeDetector('source-checkout'),
        queueActivityGateway: new StubQueueActivity(0),
        sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate({ currentBranch: 'develop' }),
        packageVersionGateway: new StubPackageVersionGateway('3.57.0'),
      });

      expect(result).toEqual({ status: 'refused', motive: { kind: 'wrong-branch' } });
    });
  });

  describe('shared preconditions (both install kinds, evaluated before install-type detection)', () => {
    it('should refuse with reviews-in-progress motive stating the total count, before detecting the install type', async () => {
      const queueActivityGateway = new StubQueueActivity(2);
      const installTypeDetector = new StubInstallTypeDetector('source-checkout');

      const result = await triggerSelfUpdate({
        selfUpdateCommand: new StubSelfUpdateCommand(),
        installTypeDetector,
        queueActivityGateway,
        sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        packageVersionGateway: new StubPackageVersionGateway('3.57.0'),
      });

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 2 },
      });
      expect(installTypeDetector.calls).toBe(0);
    });
  });
});
