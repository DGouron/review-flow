import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect } from 'vitest';

import { healthRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/health.routes.js';
import { createSupervisorStatus } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import { InMemorySupervisorStatusStore } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorStatusStore.memory.gateway.js';
import { PackageVersionFactory } from '@/tests/factories/packageVersion.factory.js';
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js';

describe('health routes', () => {
  let application: FastifyInstance;

  describe('GET /api/status', () => {
    it('should return version from config', async () => {
      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
      });
      await application.ready();

      const response = await application.inject({
        method: 'GET',
        url: '/api/status',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.version).toBe('3.6.0');
      expect(body.status).toBe('running');
    });

    it('should include version check data when cache has a value', async () => {
      const cached = PackageVersionFactory.createVersionCheckResult({
        latestVersion: '4.0.0',
        updateAvailable: true,
        checkedAt: '2026-03-14T12:00:00Z',
      });
      const versionCache = new StubVersionCache(cached, false);

      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
        versionCache,
      });
      await application.ready();

      const response = await application.inject({
        method: 'GET',
        url: '/api/status',
      });

      const body = JSON.parse(response.body);
      expect(body.latestVersion).toBe('4.0.0');
      expect(body.updateAvailable).toBe(true);
      expect(body.versionCheckedAt).toBe('2026-03-14T12:00:00Z');
    });

    it('should return null version data when cache is empty', async () => {
      const versionCache = new StubVersionCache(null, true);

      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
        versionCache,
      });
      await application.ready();

      const response = await application.inject({
        method: 'GET',
        url: '/api/status',
      });

      const body = JSON.parse(response.body);
      expect(body.latestVersion).toBeNull();
      expect(body.updateAvailable).toBe(false);
      expect(body.versionCheckedAt).toBeNull();
    });

    it('should return null version data when no versionCache is provided', async () => {
      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
      });
      await application.ready();

      const response = await application.inject({
        method: 'GET',
        url: '/api/status',
      });

      const body = JSON.parse(response.body);
      expect(body.latestVersion).toBeNull();
      expect(body.updateAvailable).toBe(false);
      expect(body.versionCheckedAt).toBeNull();
    });
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
      });
      await application.ready();

      const response = await application.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.status).toBe('ok');
    });

    it('reports the supervisor block from the injected status store', async () => {
      const store = new InMemorySupervisorStatusStore();
      store.set(createSupervisorStatus('up', null, new Date('2026-05-23T08:00:00Z')));

      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
        supervisorStatusStore: store,
      });
      await application.ready();

      const response = await application.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(body.status).toBe('ok');
      expect(body.supervisor.state).toBe('up');
      expect(body.supervisor.reason).toBeNull();
      expect(body.supervisor.lastCheckedAt).toBe('2026-05-23T08:00:00.000Z');
    });

    it('returns degraded status when the supervisor is down', async () => {
      const store = new InMemorySupervisorStatusStore();
      store.set(
        createSupervisorStatus('down', 'supervisor-spawn-failed', new Date('2026-05-23T08:00:00Z')),
      );

      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
        supervisorStatusStore: store,
      });
      await application.ready();

      const response = await application.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(body.status).toBe('degraded');
      expect(body.supervisor.state).toBe('down');
      expect(body.supervisor.reason).toBe('supervisor-spawn-failed');
    });

    it('returns supervisor state unknown when no store is provided', async () => {
      application = Fastify();
      await application.register(healthRoutes, {
        getConfig: () => ({ version: '3.6.0' }),
      });
      await application.ready();

      const response = await application.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(body.status).toBe('ok');
      expect(body.supervisor.state).toBe('unknown');
      expect(body.supervisor.reason).toBeNull();
    });
  });
});
