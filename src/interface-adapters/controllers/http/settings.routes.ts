import type { FastifyPluginAsync } from 'fastify';
import { getModel, setModel, getSettings, type ClaudeModel } from '../../../frameworks/settings/runtimeSettings.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/settings', async () => {
    return getSettings();
  });

  fastify.post('/api/settings/model', async (request, reply) => {
    const { model } = request.body as { model?: ClaudeModel };

    if (!model) {
      reply.code(400);
      return { success: false, error: 'Model is required' };
    }

    const validModels: ClaudeModel[] = ['opus', 'sonnet'];
    if (!validModels.includes(model)) {
      reply.code(400);
      return { success: false, error: 'Invalid model. Use: opus, sonnet' };
    }

    setModel(model);
    return { success: true, model: getModel() };
  });
};
