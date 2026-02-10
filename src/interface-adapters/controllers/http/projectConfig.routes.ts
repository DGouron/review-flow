import type { FastifyPluginAsync } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logInfo, logError } from '../../../frameworks/logging/logBuffer.js';

export const projectConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/project-config', async (request, reply) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    if (!projectPath) {
      reply.code(400);
      return { success: false, error: 'Project path required' };
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.code(400);
      return { success: false, error: 'Invalid path (must be absolute without ..)' };
    }

    const configPath = join(projectPath, '.claude', 'reviews', 'config.json');

    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      const requiredFields = ['github', 'gitlab', 'defaultModel', 'reviewSkill', 'reviewFollowupSkill'];
      const missingFields = requiredFields.filter(field => !(field in config));
      if (missingFields.length > 0) {
        return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
      }

      if ('agents' in config && config.agents !== undefined) {
        if (!Array.isArray(config.agents)) {
          return { success: false, error: 'Field "agents" must be an array' };
        }
        for (const agent of config.agents) {
          if (
            !agent ||
            typeof agent !== 'object' ||
            typeof agent.name !== 'string' ||
            typeof agent.displayName !== 'string' ||
            agent.name.length === 0 ||
            agent.displayName.length === 0
          ) {
            return {
              success: false,
              error: 'Invalid agents format: each agent must have { name: string, displayName: string }',
            };
          }
        }
      }

      const skillsPath = join(projectPath, '.claude', 'skills');
      const skillErrors: string[] = [];

      const reviewSkillPath = join(skillsPath, config.reviewSkill, 'SKILL.md');
      try {
        await stat(reviewSkillPath);
      } catch {
        skillErrors.push(`reviewSkill "${config.reviewSkill}" not found (${reviewSkillPath})`);
      }

      const followupSkillPath = join(skillsPath, config.reviewFollowupSkill, 'SKILL.md');
      try {
        await stat(followupSkillPath);
      } catch {
        skillErrors.push(`reviewFollowupSkill "${config.reviewFollowupSkill}" not found (${followupSkillPath})`);
      }

      if (skillErrors.length > 0) {
        return { success: false, error: skillErrors.join(' | ') };
      }

      logInfo('Project config loaded', { projectPath, config });
      return { success: true, config, path: configPath };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: 'config.json file not found in .claude/reviews/' };
      }
      logError('Error reading project config', { projectPath, error: err.message });
      return { success: false, error: 'Read error: ' + err.message };
    }
  });
};
