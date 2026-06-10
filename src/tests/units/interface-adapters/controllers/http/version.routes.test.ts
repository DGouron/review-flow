import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { versionRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/version.routes.js';
import { checkVersion } from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js';
import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { StubInstallTypeDetector } from '@/tests/stubs/installTypeDetector.stub.js';
import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js';
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js';
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js';

const installTypeDetector = new StubInstallTypeDetector('global-npm');

describe('version routes', () => {
  let application: FastifyInstance;

  describe('GET /api/version/check', () => {
    beforeEach(async () => {
      const packageVersionGateway = new StubPackageVersionGateway('2.0.0');
      const versionCache = new StubVersionCache(null, true);
      const selfUpdateCommand = new StubSelfUpdateCommand(true);

      application = Fastify();
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway,
        versionCache,
        selfUpdateCommand,
        installTypeDetector,
        serverPort: 3000,
      });
      await application.ready();
    });

    it('should return version check result', async () => {
      const response = await application.inject({
        method: 'GET',
        url: '/api/version/check',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.currentVersion).toBe('1.0.0');
      expect(body.latestVersion).toBe('2.0.0');
      expect(body.updateAvailable).toBe(true);
      expect(body.installType).toBe('global-npm');
    });

    it('should expose the detected installType in the response', async () => {
      const sourceCheckout = new StubInstallTypeDetector('source-checkout');
      const sourceApp = Fastify();
      await sourceApp.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand: new StubSelfUpdateCommand(true),
        installTypeDetector: sourceCheckout,
        serverPort: 3000,
      });
      await sourceApp.ready();

      const response = await sourceApp.inject({ method: 'GET', url: '/api/version/check' });
      const body = JSON.parse(response.body);
      expect(body.installType).toBe('source-checkout');
    });
  });

  describe('POST /api/version/update', () => {
    it('should return started on successful update', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(true);

      application = Fastify();
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
        installTypeDetector,
        serverPort: 3000,
      });
      await application.ready();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('started');
    });

    it('should return 500 on failed update', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(false, 'Permission denied');

      application = Fastify();
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
        installTypeDetector,
        serverPort: 3000,
      });
      await application.ready();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(500);
      expect(body.status).toBe('failed');
      expect(body.error).toBe('Permission denied');
    });

    it('should return 403 with command on permission denied', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(false, 'EACCES', true);

      application = Fastify();
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
        installTypeDetector,
        serverPort: 3000,
      });
      await application.ready();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(403);
      expect(body.status).toBe('permission-denied');
      expect(body.command).toBe('sudo npm update -g reviewflow');
    });

    it('should return source-checkout status with manual command and never restart the daemon for source installs', async () => {
      let restartCalled = false;
      const selfUpdateCommand = new StubSelfUpdateCommand(true);
      Object.defineProperty(selfUpdateCommand, 'restartDaemon', {
        value: async () => {
          restartCalled = true;
        },
        writable: true,
        configurable: true,
      });

      application = Fastify();
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
        installTypeDetector: new StubInstallTypeDetector('source-checkout'),
        serverPort: 3000,
      });
      await application.ready();

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('source-checkout');
      expect(body.manualCommand).toContain('git pull');
      expect(body.manualCommand).toContain('yarn build');
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(restartCalled).toBe(false);
    });
  });
});
