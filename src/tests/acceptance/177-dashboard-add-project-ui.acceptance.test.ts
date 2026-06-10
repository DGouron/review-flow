/**
 * SPEC-177 — Dashboard Project CRUD UI + Sidebar Animations
 *
 * Outer-loop acceptance test (SDD): exercises POST/DELETE/PATCH /api/repositories
 * via stub adapters backed by an in-memory RepositoryConfig array, plus
 * filesystem assertions on src/dashboard/index.html and src/dashboard/styles.css
 * to verify legacy DOM cleanup and CSS visual contracts.
 *
 * Source of truth: docs/specs/177-dashboard-add-project-ui.md (20 scenarios).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { repositoriesRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');
const STYLES_CSS_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'styles.css');

interface BuildAppOptions {
  repositories: RepositoryConfig[];
  diskExists?: Set<string>;
  writeShouldFail?: boolean;
}

async function buildAcceptanceApp(options: BuildAppOptions): Promise<{
  app: FastifyInstance;
  repositories: RepositoryConfig[];
}> {
  const repositories = options.repositories;
  const diskExists =
    options.diskExists ?? new Set(repositories.map((repository) => repository.localPath));
  const writeShouldFail = options.writeShouldFail ?? false;

  const app = Fastify();
  await app.register(repositoriesRoutes, {
    getRepositories: () => repositories,
    addRepository: ({ localPath }) => {
      if (!diskExists.has(localPath)) {
        return { status: 'not-a-directory' };
      }
      if (repositories.some((repository) => repository.localPath === localPath)) {
        return { status: 'duplicate' };
      }
      if (writeShouldFail) {
        return { status: 'write-failed' };
      }
      const name = localPath.split('/').filter(Boolean).pop() ?? localPath;
      const entry: RepositoryConfig = {
        name,
        localPath,
        platform: 'gitlab',
        remoteUrl: '',
        skill: 'review-code',
        enabled: true,
      };
      repositories.push(entry);
      return { status: 'ok', repositories };
    },
    removeRepository: ({ localPath }) => {
      const index = repositories.findIndex((repository) => repository.localPath === localPath);
      if (index < 0) return { status: 'not-found' };
      if (writeShouldFail) return { status: 'write-failed' };
      repositories.splice(index, 1);
      return { status: 'ok', repositories };
    },
    patchRepository: ({ localPath, enabled }) => {
      const target = repositories.find((repository) => repository.localPath === localPath);
      if (!target) return { status: 'not-found' };
      if (writeShouldFail) return { status: 'write-failed' };
      target.enabled = enabled;
      return { status: 'ok', repositories };
    },
  });
  return { app, repositories };
}

describe('Acceptance — SPEC-177: Dashboard Project CRUD UI + Sidebar Animations', () => {
  describe('Add (POST /api/repositories)', () => {
    it('nominal add: appends new repository and returns updated list', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [
          RepositoryConfigFactory.create({ name: 'main-app', localPath: '/home/dev/main-app-v3' }),
        ],
        diskExists: new Set(['/home/dev/main-app-v3', '/home/dev/projects/new-app']),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/home/dev/projects/new-app' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { repositories: Array<{ name: string; localPath: string }> };
      expect(body.repositories).toHaveLength(2);
      expect(body.repositories[1]?.localPath).toBe('/home/dev/projects/new-app');
      expect(repositories).toHaveLength(2);

      await app.close();
    });

    it('empty path: rejects with 400 and French message "Chemin du projet requis"', async () => {
      const { app } = await buildAcceptanceApp({ repositories: [] });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe('Chemin du projet requis');

      await app.close();
    });

    it('relative path: rejects with 400 and "Le chemin doit être absolu"', async () => {
      const { app } = await buildAcceptanceApp({ repositories: [] });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: 'projects/app' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe('Le chemin doit être absolu');

      await app.close();
    });

    it('non-existent path: rejects with 400 and "Dossier introuvable"', async () => {
      const { app } = await buildAcceptanceApp({
        repositories: [],
        diskExists: new Set(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/tmp/does-not-exist' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe('Dossier introuvable');

      await app.close();
    });

    it('duplicate path: rejects with 409 and "Projet déjà ajouté"', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [RepositoryConfigFactory.create({ localPath: '/home/dev/main-app-v3' })],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/home/dev/main-app-v3' },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: string }).error).toBe('Projet déjà ajouté');
      expect(repositories).toHaveLength(1);

      await app.close();
    });

    it('write failure on add: returns 500 with French message; in-memory unchanged', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [],
        diskExists: new Set(['/home/dev/projects/new-app']),
        writeShouldFail: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/home/dev/projects/new-app' },
      });

      expect(response.statusCode).toBe(500);
      expect((response.json() as { error: string }).error).toBe(
        "Échec de l'écriture de la configuration",
      );
      expect(repositories).toHaveLength(0);

      await app.close();
    });

    it('name derivation: the entry name comes from the last path segment', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [],
        diskExists: new Set(['/home/dev/projects/my-frontend']),
      });

      await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/home/dev/projects/my-frontend' },
      });

      expect(repositories[0]?.name).toBe('my-frontend');

      await app.close();
    });

    it('in-memory mutation visible: getRepositories returns N+1 after add', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [],
        diskExists: new Set(['/home/dev/projects/fresh']),
      });

      const initialResponse = await app.inject({ method: 'GET', url: '/api/repositories' });
      expect((initialResponse.json() as { repositories: unknown[] }).repositories).toHaveLength(0);

      await app.inject({
        method: 'POST',
        url: '/api/repositories',
        payload: { localPath: '/home/dev/projects/fresh' },
      });

      const afterResponse = await app.inject({ method: 'GET', url: '/api/repositories' });
      expect((afterResponse.json() as { repositories: unknown[] }).repositories).toHaveLength(1);
      expect(repositories).toHaveLength(1);

      await app.close();
    });
  });

  describe('Remove (DELETE /api/repositories)', () => {
    it('nominal delete: removes entry by localPath', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [
          RepositoryConfigFactory.create({ name: 'keep', localPath: '/home/dev/keep' }),
          RepositoryConfigFactory.create({
            name: 'old-project',
            localPath: '/home/dev/old-project',
          }),
        ],
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/old-project'),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { repositories: Array<{ localPath: string }> };
      expect(body.repositories).toHaveLength(1);
      expect(body.repositories[0]?.localPath).toBe('/home/dev/keep');
      expect(repositories).toHaveLength(1);

      await app.close();
    });

    it('delete unknown: rejects with 404 and "Projet introuvable"', async () => {
      const { app } = await buildAcceptanceApp({ repositories: [] });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/repositories?localPath=' + encodeURIComponent('/nope'),
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: string }).error).toBe('Projet introuvable');

      await app.close();
    });

    it('delete active tab: server-side correctness — entry removed, client picks Overview fallback', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [RepositoryConfigFactory.create({ localPath: '/home/dev/x' })],
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
      });

      expect(response.statusCode).toBe(200);
      expect(repositories).toHaveLength(0);

      await app.close();
    });
  });

  describe('Toggle enabled (PATCH /api/repositories)', () => {
    it('nominal disable: flips enabled to false', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [RepositoryConfigFactory.create({ localPath: '/home/dev/x', enabled: true })],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      expect(repositories[0]?.enabled).toBe(false);

      await app.close();
    });

    it('nominal enable: flips enabled to true', async () => {
      const { app, repositories } = await buildAcceptanceApp({
        repositories: [
          RepositoryConfigFactory.create({ localPath: '/home/dev/x', enabled: false }),
        ],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories?localPath=' + encodeURIComponent('/home/dev/x'),
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(repositories[0]?.enabled).toBe(true);

      await app.close();
    });

    it('disable unknown: rejects with 404', async () => {
      const { app } = await buildAcceptanceApp({ repositories: [] });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories?localPath=' + encodeURIComponent('/nope'),
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('Dashboard visual + cleanup contracts', () => {
    let indexHtml: string;
    let stylesCss: string;

    beforeEach(() => {
      indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
      stylesCss = readFileSync(STYLES_CSS_PATH, 'utf-8');
    });

    it('legacy DOM cleanup: 0 references to legacy DOM ids in index.html', () => {
      expect(indexHtml).not.toMatch(/project-select/);
      expect(indexHtml).not.toMatch(/project-path-input/);
    });

    it('legacy DOM cleanup: 0 references to dead legacy helpers in index.html', () => {
      expect(indexHtml).not.toMatch(/\baddProjectToHistory\b/);
      expect(indexHtml).not.toMatch(/\bupdateProjectSelect\b/);
      expect(indexHtml).not.toMatch(/\bremoveProjectFromHistory\b/);
      expect(indexHtml).not.toMatch(/\bonProjectSelect\b/);
      expect(indexHtml).not.toMatch(/\bloadProjectConfig\(/);
    });

    it('manage panel markup is present in index.html', () => {
      expect(indexHtml).toMatch(/id="manage-panel"/);
      expect(indexHtml).toMatch(/id="manage-projects-toggle"/);
    });

    it('styles.css declares selectors for manage panel and project tab animations', () => {
      expect(stylesCss).toMatch(/#manage-panel/);
      expect(stylesCss).toMatch(/\.manage-row/);
      expect(stylesCss).toMatch(/\.dashboard-tab\.is-entering/);
    });

    it('reduced motion respected: @media (prefers-reduced-motion: reduce) block exists with a rule for tabs or manage rows', () => {
      const reducedMotionBlocks = stylesCss.match(
        /@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\n\}/g,
      );
      expect(reducedMotionBlocks).not.toBeNull();
      const concatenated = (reducedMotionBlocks ?? []).join('\n');
      expect(concatenated).toMatch(/\.dashboard-tab|\.manage-row/);
    });
  });
});
