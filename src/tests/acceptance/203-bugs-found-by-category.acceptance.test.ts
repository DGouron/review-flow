/**
 * SPEC-203 — Track bugs found by category
 *
 * Spec: docs/specs/203-bugs-found-by-category.md
 * Plan: docs/plans/203-bugs-found-by-category.plan.md
 *
 * Outer-loop acceptance test (SDD): mirrors the 7 scenarios defined in the
 * spec's `## Scenarios` block. Stays RED until the data path (entity → service
 * → presenter → HTTP route) lands. Exercises the real capture/aggregation
 * service against a tmpdir, the presenter, and the GET /api/stats payload —
 * proving the slice satisfies the spec without touching infrastructure beyond
 * the file-system stats service it already uses.
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type {
  ProjectStats,
  ReviewStats,
} from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { BugsByCategoryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/bugsByCategory.presenter.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const marker = (categories: string): string =>
  `[REVIEW_STATS:blocking=0:warnings=0:suggestions=0:score=8:categories=${categories}]`;

const fileSystemStatsGateway = new FileSystemStatsGateway();

const addReviewStats = (
  projectPath: string,
  mrNumber: number,
  duration: number,
  stdout: string,
): ReviewStats =>
  new AddReviewStatsUseCase(fileSystemStatsGateway).execute({
    projectPath,
    mrNumber,
    duration,
    parsed: parseReviewOutput(stdout),
  });

const loadProjectStats = (projectPath: string): ProjectStats => {
  const stats = fileSystemStatsGateway.loadProjectStats(projectPath);
  if (stats === null) throw new Error(`No stats found for ${projectPath}`);
  return stats;
};

const saveProjectStats = (projectPath: string, stats: ProjectStats): void =>
  fileSystemStatsGateway.saveProjectStats(projectPath, stats);

describe('Acceptance — SPEC-203: Track bugs found by category', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = join(tmpdir(), `reviewflow-spec203-${Date.now()}-${Math.random()}`);
    mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  describe('each review records, per category, how many findings it flagged', () => {
    it('nominal capture: stores the full breakdown with absent categories at zero', () => {
      const review = addReviewStats(
        projectPath,
        1,
        60000,
        marker('security=3,logic=5,performance=1'),
      );

      expect(review.categoryBreakdown).toEqual({
        security: 3,
        logic: 5,
        performance: 1,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });

    it('partial breakdown: stores the reported category and fills the rest with zero', () => {
      const review = addReviewStats(projectPath, 2, 60000, marker('style=2'));

      expect(review.categoryBreakdown).toEqual({
        security: 0,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 2,
        dependencies: 0,
      });
    });
  });

  describe('only known categories are stored — unrecognized labels are ignored', () => {
    it('unknown category ignored: keeps the known count and drops the unknown one', () => {
      const review = addReviewStats(projectPath, 3, 60000, marker('security=2,cosmic=9'));

      expect(review.categoryBreakdown).toEqual({
        security: 2,
        logic: 0,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });
  });

  describe('the dashboard shows the project-wide sum across all reviews', () => {
    it('aggregation across reviews: sums each category over the project', () => {
      addReviewStats(projectPath, 1, 60000, marker('security=3'));
      addReviewStats(projectPath, 2, 60000, marker('security=2,logic=4'));

      const stats = loadProjectStats(projectPath);

      expect(stats.categoryBreakdown).toEqual({
        security: 5,
        logic: 4,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });

    it('legacy review without breakdown: contributes zero and leaves the aggregate unaffected', () => {
      const legacyReview = ReviewStatsFactory.create({ id: 'legacy', mrNumber: 9 });
      const seeded = ProjectStatsFactory.withReviews([legacyReview]);
      delete seeded.categoryBreakdown;
      saveProjectStats(projectPath, seeded);

      addReviewStats(projectPath, 10, 60000, marker('logic=2'));

      const stats = loadProjectStats(projectPath);

      expect(stats.categoryBreakdown).toEqual({
        security: 0,
        logic: 2,
        performance: 0,
        typeSafety: 0,
        style: 0,
        dependencies: 0,
      });
    });
  });

  describe('the bars are ordered from highest count to lowest, all six always present', () => {
    it('sorted output: orders bars by descending count with zero categories last', () => {
      const stats = ProjectStatsFactory.create({
        categoryBreakdown: {
          security: 3,
          logic: 5,
          performance: 0,
          typeSafety: 0,
          style: 1,
          dependencies: 0,
        },
      });

      const viewModel = new BugsByCategoryPresenter().present(stats);

      expect(viewModel.bars).toHaveLength(6);
      expect(viewModel.bars.map((bar) => bar.categoryKey)).toEqual([
        'logic',
        'security',
        'style',
        'performance',
        'typeSafety',
        'dependencies',
      ]);
      expect(viewModel.isEmpty).toBe(false);
    });
  });

  describe('a project with no category data shows an empty-state message', () => {
    it('empty project: flags the empty state with the French message', () => {
      const stats = ProjectStatsFactory.create();

      const viewModel = new BugsByCategoryPresenter().present(stats);

      expect(viewModel.isEmpty).toBe(true);
      expect(viewModel.emptyMessage).toBe('Aucune donnée de catégorie disponible');
      expect(viewModel.bars).toHaveLength(6);
      expect(viewModel.bars.every((bar) => bar.count === 0)).toBe(true);
    });
  });

  describe('the breakdown is exposed on GET /api/stats', () => {
    let app: FastifyInstance;

    afterEach(async () => {
      await app.close();
    });

    it('carries the sorted bugsByCategory view model in the single-project payload', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({
          categoryBreakdown: {
            security: 3,
            logic: 5,
            performance: 0,
            typeSafety: 0,
            style: 1,
            dependencies: 0,
          },
        }),
      );

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/known/project' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.bugsByCategory.isEmpty).toBe(false);
      expect(
        body.bugsByCategory.bars.map((bar: { categoryKey: string }) => bar.categoryKey),
      ).toEqual(['logic', 'security', 'style', 'performance', 'typeSafety', 'dependencies']);
    });
  });
});
