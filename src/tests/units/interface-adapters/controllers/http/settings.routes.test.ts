import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  getReviewTimeoutMinutes,
  setModel,
  setReviewTimeoutMinutes,
  setTriggerMode,
} from '@/frameworks/settings/runtimeSettings.js';
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

  describe('GET /api/settings/reviewTimeout', () => {
    it('should return the current review timeout in minutes', async () => {
      await setReviewTimeoutMinutes(60);

      const response = await application.inject({
        method: 'GET',
        url: '/api/settings/reviewTimeout',
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.reviewTimeoutMinutes).toBe(60);
    });
  });

  describe('POST /api/settings/reviewTimeout', () => {
    it('should persist a valid review timeout', async () => {
      const response = await application.inject({
        method: 'POST',
        url: '/api/settings/reviewTimeout',
        payload: { reviewTimeoutMinutes: 90 },
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.reviewTimeoutMinutes).toBe(90);
      expect(getReviewTimeoutMinutes()).toBe(90);
    });

    it('should reject a timeout below the minimum with 400', async () => {
      const response = await application.inject({
        method: 'POST',
        url: '/api/settings/reviewTimeout',
        payload: { reviewTimeoutMinutes: 1 },
      });

      const body = JSON.parse(response.body);
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should reject a non-integer timeout with 400', async () => {
      const response = await application.inject({
        method: 'POST',
        url: '/api/settings/reviewTimeout',
        payload: { reviewTimeoutMinutes: 42.5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should notify the injected port with the new timeout in milliseconds', async () => {
      const applied: number[] = [];
      const instance = Fastify();
      await instance.register(settingsRoutes, {
        applyReviewTimeoutMs: (timeoutMs: number) => applied.push(timeoutMs),
      });
      await instance.ready();

      await instance.inject({
        method: 'POST',
        url: '/api/settings/reviewTimeout',
        payload: { reviewTimeoutMinutes: 30 },
      });

      expect(applied).toEqual([30 * 60 * 1000]);
      await instance.close();
    });
  });
});
