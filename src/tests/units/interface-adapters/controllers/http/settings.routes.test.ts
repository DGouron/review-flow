import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import { setModel, setTriggerMode } from '@/frameworks/settings/runtimeSettings.js';
import { settingsRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/settings.routes.js';

describe('settings routes', () => {
  let application: FastifyInstance;

  beforeEach(async () => {
    application = Fastify();
    await application.register(settingsRoutes);
    await application.ready();
  });

  describe('GET /api/settings/model', () => {
    it('should return current model', async () => {
      await setModel('sonnet');

      const response = await application.inject({
        method: 'GET',
        url: '/api/settings/model',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.model).toBe('sonnet');
    });
  });

  describe('GET /api/settings/triggerMode', () => {
    it('should return the current trigger mode', async () => {
      await setTriggerMode('semi-auto');

      const response = await application.inject({
        method: 'GET',
        url: '/api/settings/triggerMode',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.triggerMode).toBe('semi-auto');
    });
  });

  describe('POST /api/settings/triggerMode', () => {
    it('should persist a valid trigger mode', async () => {
      const response = await application.inject({
        method: 'POST',
        url: '/api/settings/triggerMode',
        payload: { triggerMode: 'full-auto' },
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.triggerMode).toBe('full-auto');
    });

    it('should reject an unknown trigger mode with 400', async () => {
      const response = await application.inject({
        method: 'POST',
        url: '/api/settings/triggerMode',
        payload: { triggerMode: 'manual' },
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
    });
  });
});
