import { describe, it, expect } from 'vitest';

import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { StubInstallTypeDetector } from '@/tests/stubs/installTypeDetector.stub.js';
import { StubQueueActivity } from '@/tests/stubs/queueActivity.stub.js';
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';
import { StubSourceCheckoutUpdate } from '@/tests/stubs/sourceCheckoutUpdate.stub.js';

const LOCAL_ORIGIN = '127.0.0.1';
const REMOTE_ORIGIN = '203.0.113.5';

describe('triggerSelfUpdate usecase', () => {
  describe('global-npm install', () => {
    it('should return started when update succeeds and nothing is running', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'started' });
    });

    it('should return failed with error message when update fails', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(false, 'npm update failed'),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'failed', error: 'npm update failed' });
    });

    it('should return failed with default error when no error message provided', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(false),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'failed', error: 'Unknown error' });
    });

    it('should return permission-denied with command when permission is denied', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(false, 'EACCES', true),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({
        status: 'permission-denied',
        command: 'sudo npm update -g reviewflow',
      });
    });

    it('scenario: global install, nothing running — proceeds unchanged', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'started' });
    });

    it('scenario: global install, review running — refuses with the running count', async () => {
      const queueActivityGateway = new StubQueueActivity(1);
      const selfUpdateCommand = new StubSelfUpdateCommand(true);

      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand,
          installTypeDetector: new StubInstallTypeDetector('global-npm'),
          queueActivityGateway,
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 1 },
      });
    });

    it('scenario: global install, remote request — refuses without touching any gateway', async () => {
      const queueActivityGateway = new StubQueueActivity(0);
      const installTypeDetector = new StubInstallTypeDetector('global-npm');

      const result = await triggerSelfUpdate(
        { requestOrigin: REMOTE_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector,
          queueActivityGateway,
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'refused', motive: { kind: 'local-only' } });
      expect(queueActivityGateway.calls).toBe(0);
      expect(installTypeDetector.calls).toBe(0);
    });
  });

  describe('source-checkout install', () => {
    it('should delegate to the source-checkout sequence and return started', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(false, 'should never be called', true);

      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand,
          installTypeDetector: new StubInstallTypeDetector('source-checkout'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'started' });
    });

    it('should propagate a refusal motive produced by the source-checkout sequence', async () => {
      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector: new StubInstallTypeDetector('source-checkout'),
          queueActivityGateway: new StubQueueActivity(0),
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate({ currentBranch: 'develop' }),
        },
      );

      expect(result).toEqual({ status: 'refused', motive: { kind: 'wrong-branch' } });
    });
  });

  describe('shared preconditions (both install kinds, evaluated before install-type detection)', () => {
    it('should refuse with local-only motive when the request does not come from the local machine', async () => {
      const queueActivityGateway = new StubQueueActivity(0);
      const installTypeDetector = new StubInstallTypeDetector('source-checkout');

      const result = await triggerSelfUpdate(
        { requestOrigin: REMOTE_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector,
          queueActivityGateway,
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({ status: 'refused', motive: { kind: 'local-only' } });
      expect(queueActivityGateway.calls).toBe(0);
      expect(installTypeDetector.calls).toBe(0);
    });

    it('should refuse with reviews-in-progress motive stating the total count, before detecting the install type', async () => {
      const queueActivityGateway = new StubQueueActivity(2);
      const installTypeDetector = new StubInstallTypeDetector('source-checkout');

      const result = await triggerSelfUpdate(
        { requestOrigin: LOCAL_ORIGIN },
        {
          selfUpdateCommand: new StubSelfUpdateCommand(true),
          installTypeDetector,
          queueActivityGateway,
          sourceCheckoutUpdateGateway: new StubSourceCheckoutUpdate(),
        },
      );

      expect(result).toEqual({
        status: 'refused',
        motive: { kind: 'reviews-in-progress', count: 2 },
      });
      expect(installTypeDetector.calls).toBe(0);
    });
  });
});
