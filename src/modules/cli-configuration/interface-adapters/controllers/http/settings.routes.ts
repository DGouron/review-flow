import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  claudeModelSchema,
  getModel,
  setModel,
  getDefaultLanguage,
  setDefaultLanguage,
  getTriggerMode,
  setTriggerMode,
  getReviewTimeoutMinutes,
  getReviewTimeoutMs,
  setReviewTimeoutMinutes,
  getSettings,
  REVIEW_TIMEOUT_MINUTES_MIN,
  REVIEW_TIMEOUT_MINUTES_MAX,
} from '@/frameworks/settings/runtimeSettings.js';
import { languageSchema } from '@/modules/shared-kernel/entities/language/language.schema.js';
import { triggerModeSchema } from '@/modules/shared-kernel/entities/triggerMode/triggerMode.schema.js';

const modelRequestSchema = z.object({ model: claudeModelSchema });
const languageRequestSchema = z.object({ language: languageSchema });
const triggerModeRequestSchema = z.object({ triggerMode: triggerModeSchema });
const reviewTimeoutRequestSchema = z.object({
  reviewTimeoutMinutes: z
    .number()
    .int()
    .min(REVIEW_TIMEOUT_MINUTES_MIN)
    .max(REVIEW_TIMEOUT_MINUTES_MAX),
});

/**
 * The review timeout is read at boot by the shared ClaudeInvocationDeps and by
 * the PQueue job timeout, so a change must be pushed into those live objects
 * instead of waiting for a daemon restart. The composition root supplies the
 * port; tests and CLI one-shots can omit it.
 */
export interface SettingsRoutesOptions {
  applyReviewTimeoutMs?: (timeoutMs: number) => void;
}

export const settingsRoutes: FastifyPluginAsync<SettingsRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/settings', async () => {
    return getSettings();
  });

  fastify.get('/api/settings/model', async () => {
    return { model: getModel() };
  });

  fastify.post('/api/settings/model', async (request, reply) => {
    const parsed = modelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid model. Use: ${claudeModelSchema.options.join(', ')}`,
      };
    }

    await setModel(parsed.data.model);
    return { success: true, model: getModel() };
  });

  fastify.post('/api/settings/language', async (request, reply) => {
    const parsed = languageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid language. Use: ${languageSchema.options.join(', ')}`,
      };
    }

    await setDefaultLanguage(parsed.data.language);
    return { success: true, language: getDefaultLanguage() };
  });

  fastify.get('/api/settings/triggerMode', async () => {
    return { triggerMode: getTriggerMode() };
  });

  fastify.post('/api/settings/triggerMode', async (request, reply) => {
    const parsed = triggerModeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid trigger mode. Use: ${triggerModeSchema.options.join(', ')}`,
      };
    }

    await setTriggerMode(parsed.data.triggerMode);
    return { success: true, triggerMode: getTriggerMode() };
  });

  fastify.get('/api/settings/reviewTimeout', async () => {
    return {
      reviewTimeoutMinutes: getReviewTimeoutMinutes(),
      minMinutes: REVIEW_TIMEOUT_MINUTES_MIN,
      maxMinutes: REVIEW_TIMEOUT_MINUTES_MAX,
    };
  });

  fastify.post('/api/settings/reviewTimeout', async (request, reply) => {
    const parsed = reviewTimeoutRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid review timeout. Use an integer number of minutes between ${REVIEW_TIMEOUT_MINUTES_MIN} and ${REVIEW_TIMEOUT_MINUTES_MAX}`,
      };
    }

    await setReviewTimeoutMinutes(parsed.data.reviewTimeoutMinutes);
    options.applyReviewTimeoutMs?.(getReviewTimeoutMs());
    return { success: true, reviewTimeoutMinutes: getReviewTimeoutMinutes() };
  });
};
