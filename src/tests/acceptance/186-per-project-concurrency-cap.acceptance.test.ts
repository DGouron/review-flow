/**
 * SPEC-186 — Per-project concurrency cap for reviews.
 *
 * Outer-loop acceptance test (SDD). Stays RED while the inside-out
 * implementation is in progress, flips GREEN once all layers are wired.
 *
 * Source of truth: docs/specs/186-per-project-concurrency-cap.md (17 DSL scenarios).
 *
 * The scenarios are grouped by Rule:
 *   - Cap validation (range + integer + empty) → 7 scenarios.
 *   - Missing key fallback → 1 scenario.
 *   - Runtime enforcement (held / running / lower / raise) → 4 scenarios.
 *   - Dashboard header arithmetic (sum / running / saturation / add / remove) → 5 scenarios.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { buildHeaderCapacityViewModel } from '@/dashboard/modules/headerCapacityBadge.js';
import {
  validateMaxConcurrentReviews,
  buildSettingsViewModel,
  renderSettingsModalHtml,
} from '@/dashboard/modules/settingsModal.js';
import { ProjectSemaphore } from '@/frameworks/queue/projectSemaphore.js';
import {
  effectiveProjectConcurrencyCap,
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
  PROJECT_CAP_NOT_INTEGER_MESSAGE,
  PROJECT_CAP_REQUIRED_MESSAGE,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { RecomputeGlobalConcurrencyUseCase } from '@/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { OverviewPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';
import { StubQueueCapacityPort } from '@/tests/stubs/queueCapacityPort.stub.js';
import { StubRepositoriesListGateway } from '@/tests/stubs/repositoriesListGateway.stub.js';

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

async function buildPatchApp(gateway: StubProjectConfigGateway): Promise<FastifyInstance> {
  const app = Fastify();
  const updateProjectConfig = new UpdateProjectConfigUseCase(gateway);
  await app.register(projectConfigRoutes, { updateProjectConfig });
  return app;
}

describe('Acceptance — SPEC-186: Per-project concurrency cap', () => {
  describe('Rule: cap validation (range 1-10, integer, required) — server PATCH', () => {
    it('valid update {maxConcurrentReviews: 4} → 200 + persisted "4"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: 4 },
      });

      expect(response.statusCode).toBe(200);
      expect(gateway.get('/home/user/proj')?.maxConcurrentReviews).toBe(4);
      await app.close();
    });

    it('value too low {maxConcurrentReviews: 0} → rejects "La valeur doit être comprise entre 1 et 10"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: 0 },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_OUT_OF_RANGE_MESSAGE);
      await app.close();
    });

    it('value too high {maxConcurrentReviews: 11} → rejects "La valeur doit être comprise entre 1 et 10"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: 11 },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_OUT_OF_RANGE_MESSAGE);
      await app.close();
    });

    it('value negative {maxConcurrentReviews: -1} → rejects "La valeur doit être comprise entre 1 et 10"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_OUT_OF_RANGE_MESSAGE);
      await app.close();
    });

    it('value non integer {maxConcurrentReviews: 2.5} → rejects "La valeur doit être un nombre entier"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: 2.5 },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_NOT_INTEGER_MESSAGE);
      await app.close();
    });

    it('value not a number {maxConcurrentReviews: "abc"} → rejects "La valeur doit être un nombre entier"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: 'abc' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_NOT_INTEGER_MESSAGE);
      await app.close();
    });

    it('value empty {maxConcurrentReviews: ""} → rejects "La valeur est obligatoire"', async () => {
      const gateway = new StubProjectConfigGateway();
      gateway.set('/home/user/proj', baseProjectConfig());
      const app = await buildPatchApp(gateway);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/project-config?path=' + encodeURIComponent('/home/user/proj'),
        payload: { maxConcurrentReviews: '' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe(PROJECT_CAP_REQUIRED_MESSAGE);
      await app.close();
    });
  });

  describe('Rule: missing key falls back to default 2', () => {
    it('config without maxConcurrentReviews → effective cap "2"', () => {
      const cap = effectiveProjectConcurrencyCap({});

      expect(cap).toBe(DEFAULT_PROJECT_CONCURRENCY_CAP);
      expect(cap).toBe(2);
    });
  });

  describe('Rule: runtime enforcement of per-project cap (ProjectSemaphore)', () => {
    it('enforce cap at runtime {cap: 2, running: 2, new: 1} → "queued"', async () => {
      const semaphore = new ProjectSemaphore();
      semaphore.setCapacity('/proj/A', 2);

      const firstAcquired = await semaphore.acquire('/proj/A');
      const secondAcquired = await semaphore.acquire('/proj/A');

      expect(firstAcquired).toBe(true);
      expect(secondAcquired).toBe(true);
      expect(semaphore.runningCount('/proj/A')).toBe(2);

      let thirdResolved = false;
      const thirdPromise = (async () => {
        await semaphore.acquire('/proj/A');
        thirdResolved = true;
      })();

      await Promise.resolve();
      await Promise.resolve();

      expect(thirdResolved).toBe(false);
      expect(semaphore.pendingCount('/proj/A')).toBe(1);

      semaphore.release('/proj/A');
      await thirdPromise;

      expect(thirdResolved).toBe(true);
    });

    it('below cap accepts new review {cap: 3, running: 2, new: 1} → "running"', async () => {
      const semaphore = new ProjectSemaphore();
      semaphore.setCapacity('/proj/A', 3);

      await semaphore.acquire('/proj/A');
      await semaphore.acquire('/proj/A');
      const third = await semaphore.acquire('/proj/A');

      expect(third).toBe(true);
      expect(semaphore.runningCount('/proj/A')).toBe(3);
      expect(semaphore.pendingCount('/proj/A')).toBe(0);
    });

    it('lower cap with running reviews {cap: 4, running: 4, lowerTo: 2} → running unchanged + next "queued"', async () => {
      const semaphore = new ProjectSemaphore();
      semaphore.setCapacity('/proj/A', 4);
      await semaphore.acquire('/proj/A');
      await semaphore.acquire('/proj/A');
      await semaphore.acquire('/proj/A');
      await semaphore.acquire('/proj/A');

      semaphore.setCapacity('/proj/A', 2);

      expect(semaphore.runningCount('/proj/A')).toBe(4);

      let queuedResolved = false;
      const queuedPromise = (async () => {
        await semaphore.acquire('/proj/A');
        queuedResolved = true;
      })();

      await Promise.resolve();
      await Promise.resolve();
      expect(queuedResolved).toBe(false);

      semaphore.release('/proj/A');
      semaphore.release('/proj/A');
      await Promise.resolve();
      expect(queuedResolved).toBe(false);

      semaphore.release('/proj/A');
      await queuedPromise;
      expect(queuedResolved).toBe(true);
    });

    it('raise cap releases queued {cap: 2, running: 2, queued: 3, raiseTo: 4} → 2 released, 1 still queued', async () => {
      const semaphore = new ProjectSemaphore();
      semaphore.setCapacity('/proj/A', 2);
      await semaphore.acquire('/proj/A');
      await semaphore.acquire('/proj/A');

      const releasedCounter = { count: 0 };
      const acquireAndCount = async (): Promise<void> => {
        await semaphore.acquire('/proj/A');
        releasedCounter.count += 1;
      };
      const queuedPromises = [acquireAndCount(), acquireAndCount(), acquireAndCount()];

      await Promise.resolve();
      expect(releasedCounter.count).toBe(0);
      expect(semaphore.pendingCount('/proj/A')).toBe(3);

      semaphore.setCapacity('/proj/A', 4);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(releasedCounter.count).toBe(2);
      expect(semaphore.pendingCount('/proj/A')).toBe(1);

      semaphore.release('/proj/A');
      await Promise.resolve();
      expect(releasedCounter.count).toBe(3);
      expect(semaphore.pendingCount('/proj/A')).toBe(0);

      await Promise.all(queuedPromises);
    });
  });

  describe('Rule: total capacity equals sum across declared projects', () => {
    it('total capacity equals sum {projects: [{cap:2},{cap:3},{cap:1}]} → header max "6"', async () => {
      const repositoriesList = new StubRepositoriesListGateway();
      repositoriesList.set([
        { name: 'A', localPath: '/repos/A', enabled: true },
        { name: 'B', localPath: '/repos/B', enabled: true },
        { name: 'C', localPath: '/repos/C', enabled: true },
      ]);
      const projectConfig = new StubProjectConfigGateway();
      projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
      projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
      projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 1 }));
      const queueCapacityPort = new StubQueueCapacityPort();
      const recompute = new RecomputeGlobalConcurrencyUseCase({
        repositoriesListGateway: repositoriesList,
        projectConfigGateway: projectConfig,
        queueCapacityPort,
      });

      const result = recompute.execute({});

      expect(result.totalCapacity).toBe(6);
      expect(queueCapacityPort.globalConcurrency).toBe(6);
    });

    it('new project adds to total {existingTotal: 5, added: {cap: 3}} → max "8"', () => {
      const repositoriesList = new StubRepositoriesListGateway();
      repositoriesList.set([
        { name: 'A', localPath: '/repos/A', enabled: true },
        { name: 'B', localPath: '/repos/B', enabled: true },
      ]);
      const projectConfig = new StubProjectConfigGateway();
      projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
      projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
      const queueCapacityPort = new StubQueueCapacityPort();
      const recompute = new RecomputeGlobalConcurrencyUseCase({
        repositoriesListGateway: repositoriesList,
        projectConfigGateway: projectConfig,
        queueCapacityPort,
      });

      const before = recompute.execute({});
      expect(before.totalCapacity).toBe(5);

      repositoriesList.set([
        { name: 'A', localPath: '/repos/A', enabled: true },
        { name: 'B', localPath: '/repos/B', enabled: true },
        { name: 'C', localPath: '/repos/C', enabled: true },
      ]);
      projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 3 }));

      const after = recompute.execute({});
      expect(after.totalCapacity).toBe(8);
    });

    it('project removed shrinks total {existingTotal: 8, removed: {cap: 3}} → max "5"', () => {
      const repositoriesList = new StubRepositoriesListGateway();
      repositoriesList.set([
        { name: 'A', localPath: '/repos/A', enabled: true },
        { name: 'B', localPath: '/repos/B', enabled: true },
        { name: 'C', localPath: '/repos/C', enabled: true },
      ]);
      const projectConfig = new StubProjectConfigGateway();
      projectConfig.set('/repos/A', baseProjectConfig({ maxConcurrentReviews: 2 }));
      projectConfig.set('/repos/B', baseProjectConfig({ maxConcurrentReviews: 3 }));
      projectConfig.set('/repos/C', baseProjectConfig({ maxConcurrentReviews: 3 }));
      const queueCapacityPort = new StubQueueCapacityPort();
      const recompute = new RecomputeGlobalConcurrencyUseCase({
        repositoriesListGateway: repositoriesList,
        projectConfigGateway: projectConfig,
        queueCapacityPort,
      });

      expect(recompute.execute({}).totalCapacity).toBe(8);

      repositoriesList.set([
        { name: 'A', localPath: '/repos/A', enabled: true },
        { name: 'B', localPath: '/repos/B', enabled: true },
      ]);

      expect(recompute.execute({}).totalCapacity).toBe(5);
    });
  });

  describe('Rule: header reflects running / total + saturation', () => {
    it('header reflects running count {projects: [{running:1,cap:2},{running:2,cap:3}]} → "3 / 5"', () => {
      const presenter = new OverviewPresenter();

      const viewModel = presenter.present({
        repositories: [RepositoryConfigFactory.create({ name: 'A', localPath: '/repos/A' })],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        capacity: { running: 3, max: 5 },
      });

      expect(viewModel.headerCapacity.label).toBe('3 / 5');
      expect(viewModel.headerCapacity.isSaturated).toBe(false);
    });

    it('saturated header at full load {projects: [{running:2,cap:2},{running:3,cap:3}]} → "5 / 5" + saturated', () => {
      const presenter = new OverviewPresenter();

      const viewModel = presenter.present({
        repositories: [RepositoryConfigFactory.create({ name: 'A', localPath: '/repos/A' })],
        activeJobs: [],
        projectStats: [],
        recentReviews: [],
        capacity: { running: 5, max: 5 },
      });

      expect(viewModel.headerCapacity.label).toBe('5 / 5');
      expect(viewModel.headerCapacity.isSaturated).toBe(true);
    });
  });

  describe('Frontend humble module — validateMaxConcurrentReviews (mirrors server)', () => {
    it('accepts integer values 1 through 10', () => {
      for (const value of ['1', '2', '5', '7', '10']) {
        expect(validateMaxConcurrentReviews(value)).toEqual({ ok: true });
      }
    });

    it('rejects empty with the French required message', () => {
      expect(validateMaxConcurrentReviews('')).toEqual({
        ok: false,
        message: PROJECT_CAP_REQUIRED_MESSAGE,
      });
    });

    it('rejects 0 with the range message', () => {
      expect(validateMaxConcurrentReviews('0')).toEqual({
        ok: false,
        message: PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
      });
    });

    it('rejects 11 with the range message', () => {
      expect(validateMaxConcurrentReviews('11')).toEqual({
        ok: false,
        message: PROJECT_CAP_OUT_OF_RANGE_MESSAGE,
      });
    });

    it('rejects 2.5 with the integer message', () => {
      expect(validateMaxConcurrentReviews('2.5')).toEqual({
        ok: false,
        message: PROJECT_CAP_NOT_INTEGER_MESSAGE,
      });
    });

    it('rejects "abc" with the integer message', () => {
      expect(validateMaxConcurrentReviews('abc')).toEqual({
        ok: false,
        message: PROJECT_CAP_NOT_INTEGER_MESSAGE,
      });
    });
  });

  describe('Frontend humble module — settings modal exposes maxConcurrentReviews input', () => {
    it('settings modal HTML contains an input for maxConcurrentReviews bounded to 1-10', () => {
      const html = renderSettingsModalHtml(
        buildSettingsViewModel({
          config: baseProjectConfig({ maxConcurrentReviews: 4 }),
          projectName: 'frontend',
        }),
      );

      expect(html).toMatch(/<input[^>]+name="maxConcurrentReviews"[^>]+type="number"/);
      expect(html).toMatch(/<input[^>]+name="maxConcurrentReviews"[^>]+min="1"/);
      expect(html).toMatch(/<input[^>]+name="maxConcurrentReviews"[^>]+max="10"/);
      expect(html).toMatch(/<input[^>]+name="maxConcurrentReviews"[^>]+value="4"/);
    });
  });

  describe('Frontend humble module — header capacity badge', () => {
    it('builds a viewmodel with "N / M" label and isSaturated false when under load', () => {
      const viewModel = buildHeaderCapacityViewModel({ running: 3, max: 5 });

      expect(viewModel.label).toBe('3 / 5');
      expect(viewModel.isSaturated).toBe(false);
    });

    it('marks the viewmodel saturated when running equals max', () => {
      const viewModel = buildHeaderCapacityViewModel({ running: 5, max: 5 });

      expect(viewModel.label).toBe('5 / 5');
      expect(viewModel.isSaturated).toBe(true);
    });
  });
});
