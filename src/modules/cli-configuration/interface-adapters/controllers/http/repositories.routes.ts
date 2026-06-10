import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AddRepositoryRouteResult } from '@/modules/cli-configuration/usecases/dashboardRepositories/addRepositoryFromDashboard.usecase.js';
import type { RemoveRepositoryRouteResult } from '@/modules/cli-configuration/usecases/dashboardRepositories/removeRepositoryFromDashboard.usecase.js';
import type { PatchRepositoryRouteResult } from '@/modules/cli-configuration/usecases/dashboardRepositories/updateRepositoryEnabledFromDashboard.usecase.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

export interface RepositoriesRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  addRepository: (input: { localPath: string }) => AddRepositoryRouteResult;
  removeRepository: (input: { localPath: string }) => RemoveRepositoryRouteResult;
  patchRepository: (input: { localPath: string; enabled: boolean }) => PatchRepositoryRouteResult;
}

const addRepositoryBodySchema = z.object({ localPath: z.string() }).passthrough();
const repositoryQuerySchema = z.object({ localPath: z.string() }).passthrough();
const patchRepositoryBodySchema = z.object({ enabled: z.boolean() }).passthrough();

function projectRepositories(repositories: RepositoryConfig[]) {
  return repositories.map((repository) => ({
    name: repository.name,
    localPath: repository.localPath,
    platform: repository.platform,
    enabled: repository.enabled,
    remoteUrl: repository.remoteUrl,
  }));
}

function isAbsoluteSafePath(path: string): boolean {
  return path.startsWith('/') && !path.includes('..');
}

const WRITE_FAILED_MESSAGE = "Échec de l'écriture de la configuration";
const PATH_REQUIRED_MESSAGE = 'Chemin du projet requis';
const PATH_NOT_ABSOLUTE_MESSAGE = 'Le chemin doit être absolu';

export const repositoriesRoutes: FastifyPluginAsync<RepositoriesRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/repositories', async () => {
    return { repositories: projectRepositories(options.getRepositories()) };
  });

  fastify.post('/api/repositories', async (request, reply) => {
    const parsed = addRepositoryBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: PATH_REQUIRED_MESSAGE });
    }
    const localPath = parsed.data.localPath.trim();

    if (localPath.length === 0) {
      return reply.code(400).send({ error: PATH_REQUIRED_MESSAGE });
    }
    if (!isAbsoluteSafePath(localPath)) {
      return reply.code(400).send({ error: PATH_NOT_ABSOLUTE_MESSAGE });
    }

    const result = options.addRepository({ localPath });
    if (result.status === 'not-a-directory') {
      return reply.code(400).send({ error: 'Dossier introuvable' });
    }
    if (result.status === 'duplicate') {
      return reply.code(409).send({ error: 'Projet déjà ajouté' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });

  fastify.delete('/api/repositories', async (request, reply) => {
    const parsed = repositoryQuerySchema.safeParse(request.query);
    const localPath = parsed.success ? parsed.data.localPath : '';
    if (localPath.length === 0) {
      return reply.code(400).send({ error: PATH_REQUIRED_MESSAGE });
    }
    const result = options.removeRepository({ localPath });
    if (result.status === 'not-found') {
      return reply.code(404).send({ error: 'Projet introuvable' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });

  fastify.patch('/api/repositories', async (request, reply) => {
    const parsedQuery = repositoryQuerySchema.safeParse(request.query);
    const localPath = parsedQuery.success ? parsedQuery.data.localPath : '';
    if (localPath.length === 0) {
      return reply.code(400).send({ error: PATH_REQUIRED_MESSAGE });
    }
    const parsedBody = patchRepositoryBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Le champ "enabled" doit être un booléen' });
    }
    const result = options.patchRepository({ localPath, enabled: parsedBody.data.enabled });
    if (result.status === 'not-found') {
      return reply.code(404).send({ error: 'Projet introuvable' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });
};
