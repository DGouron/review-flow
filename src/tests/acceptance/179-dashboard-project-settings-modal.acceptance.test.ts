/**
 * SPEC-179 — Configure Project Settings via a Modal
 *
 * Outer-loop acceptance test (SDD): exercises GET / PATCH /api/project-config
 * through the Fastify plugin wired with the in-memory stub gateway, plus
 * filesystem-grep assertions on src/dashboard/index.html and styles.css for
 * the sidebar button, the <dialog> markup and the reduced-motion contract.
 *
 * Source of truth: docs/specs/179-dashboard-project-settings-modal.md (15 scenarios).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import {
  validateExternalLink,
  buildSettingsViewModel,
  renderSettingsModalHtml,
} from '@/dashboard/modules/settingsModal.js';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');
const STYLES_CSS_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'styles.css');

function baseProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    github: false,
    gitlab: true,
    defaultModel: 'sonnet',
    reviewSkill: 'review-front',
    reviewFollowupSkill: 'review-followup',
    language: 'fr',
    retentionDays: 14,
    ...overrides,
  };
}

interface BuildAppOptions {
  gateway: StubProjectConfigGateway;
  onUpdated?: (config: ProjectConfig) => void;
}

async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  const updateProjectConfig = new UpdateProjectConfigUseCase(options.gateway, options.onUpdated);
  await app.register(projectConfigRoutes, { updateProjectConfig });
  return app;
}

describe('Acceptance — SPEC-179: Configure Project Settings via a Modal', () => {
  describe('PATCH /api/project-config — save changes', () => {
    it('language change persists and preserves agents / routingPolicy (S3)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set(
        '/repo/A',
        baseProjectConfig({
          language: 'fr',
          agents: [{ name: 'security', displayName: 'Security' }],
          routingPolicy: { haikuMaxLines: 50, sonnetMaxLines: 500 },
        }),
      );
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { language: 'en' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean; config: ProjectConfig };
      expect(body.success).toBe(true);
      expect(body.config.language).toBe('en');
      expect(body.config.agents).toEqual([{ name: 'security', displayName: 'Security' }]);
      expect(body.config.routingPolicy).toEqual({ haikuMaxLines: 50, sonnetMaxLines: 500 });
      const persisted = gateway.get('/repo/A');
      expect(persisted?.language).toBe('en');
      expect(persisted?.agents).toEqual([{ name: 'security', displayName: 'Security' }]);

      await app.close();
    });

    it('defaultModel "sonnet" persists and next read returns sonnet (S4, S13)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig({ defaultModel: 'haiku' }));
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { defaultModel: 'sonnet' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { config: ProjectConfig };
      expect(body.config.defaultModel).toBe('sonnet');
      const reread = gateway.read('/repo/A');
      expect(reread.status).toBe('ok');
      if (reread.status === 'ok') {
        expect(reread.config.defaultModel).toBe('sonnet');
      }

      await app.close();
    });

    it('externalLink "https://notion.so/x" → 200 + persisted (S5)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { externalLink: 'https://notion.so/team/projet' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { config: ProjectConfig };
      expect(body.config.externalLink).toBe('https://notion.so/team/projet');

      await app.close();
    });

    it('empty externalLink "" → 200 + key absent from persisted config (S6)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig({ externalLink: 'https://old.example' }));
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { externalLink: '' },
      });

      expect(response.statusCode).toBe(200);
      const persisted = gateway.get('/repo/A');
      expect(persisted?.externalLink).toBeUndefined();

      await app.close();
    });

    it('rejects http://insecure with "Le lien doit être en HTTPS" (S7)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { externalLink: 'http://insecure.example' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('Le lien doit être en HTTPS');

      await app.close();
    });

    it('rejects javascript:alert(1) with "URL invalide" (S8)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { externalLink: 'javascript:alert(1)' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { error: string };
      expect(body.error).toBe('URL invalide');

      await app.close();
    });

    it('rejects free text "not a url" with "URL invalide" (S9)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { externalLink: 'not a url' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe('URL invalide');

      await app.close();
    });

    it('missing project → 404', async () => {
      const gateway = new StubProjectConfigGateway();
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/unknown'),
        payload: { language: 'en' },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it('corrupt config.json → 422 "Configuration projet illisible" (S14)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      gateway.forceMalformed('/repo/A');
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { language: 'en' },
      });

      expect(response.statusCode).toBe(422);
      expect((response.json() as { error: string }).error).toBe('Configuration projet illisible');

      await app.close();
    });

    it('write failure → 500 "Échec de la sauvegarde" (S15)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig());
      gateway.forceIoError();
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { language: 'en' },
      });

      expect(response.statusCode).toBe(500);
      expect((response.json() as { error: string }).error).toBe('Échec de la sauvegarde');

      await app.close();
    });

    it('ignores out-of-scope fields like "agents" in the payload silently', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set(
        '/repo/A',
        baseProjectConfig({
          agents: [{ name: 'security', displayName: 'Security' }],
        }),
      );
      const app = await buildApp({ gateway });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: {
          language: 'en',
          agents: [{ name: 'evil', displayName: 'Evil' }],
        },
      });

      expect(response.statusCode).toBe(200);
      const persisted = gateway.get('/repo/A');
      expect(persisted?.agents).toEqual([{ name: 'security', displayName: 'Security' }]);
      expect(persisted?.language).toBe('en');

      await app.close();
    });
  });

  describe('In-memory propagation (S13)', () => {
    it('next read after PATCH returns the new value (inflight review keeps old)', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/repo/A', baseProjectConfig({ language: 'fr' }));
      const inflight = gateway.read('/repo/A');
      const app = await buildApp({ gateway });

      await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
        payload: { language: 'en' },
      });

      const next = gateway.read('/repo/A');
      if (inflight.status === 'ok') {
        expect(inflight.config.language).toBe('fr');
      } else {
        throw new Error('inflight read should succeed');
      }
      if (next.status === 'ok') {
        expect(next.config.language).toBe('en');
      } else {
        throw new Error('next read should succeed');
      }

      await app.close();
    });
  });

  describe('Frontend humble module — validateExternalLink', () => {
    it('accepts an empty string', () => {
      expect(validateExternalLink('')).toEqual({ ok: true });
    });

    it('accepts an https url', () => {
      expect(validateExternalLink('https://notion.so/x')).toEqual({ ok: true });
    });

    it('rejects http with the French HTTPS message (S7)', () => {
      expect(validateExternalLink('http://insecure.example')).toEqual({
        ok: false,
        message: 'Le lien doit être en HTTPS',
      });
    });

    it('rejects javascript: with "URL invalide" (S8)', () => {
      expect(validateExternalLink('javascript:alert(1)')).toEqual({
        ok: false,
        message: 'URL invalide',
      });
    });

    it('rejects free text with "URL invalide" (S9)', () => {
      expect(validateExternalLink('not a url')).toEqual({ ok: false, message: 'URL invalide' });
    });
  });

  describe('Frontend humble module — render', () => {
    it('renders the modal with the 5 editable fields pre-filled from the config (S1)', () => {
      const html = renderSettingsModalHtml(
        buildSettingsViewModel({
          config: baseProjectConfig({
            language: 'en',
            defaultModel: 'opus',
            reviewSkill: 'review-back',
            reviewFollowupSkill: 'review-followup',
            externalLink: 'https://notion.so/x',
          }),
          projectName: 'A',
        }),
      );

      expect(html).toContain('A');
      expect(html).toContain('name="language"');
      expect(html).toContain('name="defaultModel"');
      expect(html).toContain('name="reviewSkill"');
      expect(html).toContain('name="reviewFollowupSkill"');
      expect(html).toContain('name="externalLink"');
      expect(html).toContain('https://notion.so/x');
    });
  });

  describe('Dashboard markup contracts (cross-checks for S1, S2, S16)', () => {
    let indexHtml: string;
    let stylesCss: string;

    beforeEach(() => {
      indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
      stylesCss = readFileSync(STYLES_CSS_PATH, 'utf-8');
    });

    it('sidebar Settings button is present with id="open-settings-modal-btn"', () => {
      expect(indexHtml).toMatch(/id="open-settings-modal-btn"/);
    });

    it('<dialog id="settings-modal"> is present in index.html', () => {
      expect(indexHtml).toMatch(/<dialog[^>]*id="settings-modal"/);
    });

    it('styles.css declares a .settings-modal selector', () => {
      expect(stylesCss).toMatch(/\.settings-modal\b/);
    });

    it('styles.css honors prefers-reduced-motion with a rule touching .settings-modal', () => {
      const reducedMotionBlocks =
        stylesCss.match(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\n\}/g) ?? [];
      const concatenated = reducedMotionBlocks.join('\n');
      expect(concatenated).toMatch(/\.settings-modal/);
    });
  });
});
