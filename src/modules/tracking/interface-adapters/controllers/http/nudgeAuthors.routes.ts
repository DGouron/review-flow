import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { NudgeAuthorsUseCase } from '@/modules/tracking/usecases/tracking/nudgeAuthors.usecase.js';

export interface NudgeAuthorsRoutesOptions {
  nudgeAuthors: NudgeAuthorsUseCase;
  logger: Logger;
}

const nudgeRequestSchema = z.object({
  projectPath: z
    .string()
    .trim()
    .refine((path) => path.startsWith('/') && !path.includes('..')),
  mrIds: z.array(z.string().min(1)).min(1).max(100),
  language: z.enum(['en', 'fr']).default('en'),
});

export const nudgeAuthorsRoutes: FastifyPluginAsync<NudgeAuthorsRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.post('/api/mr-tracking/nudge', async (request, reply) => {
    const parsed = nudgeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { success: false, error: 'projectPath and mrIds required' };
    }

    const result = await options.nudgeAuthors.execute(parsed.data);
    options.logger.info(
      { projectPath: parsed.data.projectPath, nudged: result.nudged, failed: result.failed },
      'Authors nudged from the dashboard',
    );
    return { success: true, ...result };
  });
};
