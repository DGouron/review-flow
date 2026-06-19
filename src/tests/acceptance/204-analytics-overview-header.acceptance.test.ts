/**
 * SPEC-204 — Show the analytics overview header
 *
 * Spec: docs/specs/204-analytics-overview-header.md
 * Plan: docs/plans/204-analytics-overview-header.plan.md
 *
 * Outer-loop acceptance test (SDD): mirrors the 5 scenarios defined in the
 * spec's `## Scenarios` block. Stays RED until the data path (entity →
 * service formatter → presenter → HTTP route) lands. Exercises the presenter
 * directly and the GET /api/stats payload via Fastify.inject against the
 * in-memory stats gateway, proving the slice satisfies the spec without
 * touching infrastructure.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, afterEach } from 'vitest';

import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { AnalyticsHeaderPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/analyticsHeader.presenter.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const NOW = new Date('2024-12-15T12:00:00Z');

const present = (stats = ProjectStatsFactory.create(), now = NOW) =>
  new AnalyticsHeaderPresenter().present(stats, now);

describe('Acceptance — SPEC-204: Show the analytics overview header', () => {
  describe('the header shows three KPI cards: PRs Reviewed, Bugs Caught, Average Review Time', () => {
    it('nominal: PRs Reviewed 43, Bugs Caught 57, Average Review Time "4m"', () => {
      const viewModel = present(
        ProjectStatsFactory.create({
          totalReviews: 43,
          totalBlocking: 16,
          totalWarnings: 41,
          averageDuration: 252000,
        }),
      );

      expect(viewModel.prsReviewed.value).toBe(43);
      expect(viewModel.bugsCaught.value).toBe(57);
      expect(viewModel.averageReviewTime.value).toBe('4m');
    });
  });

  describe('"Bugs Caught" is blocking plus important findings, suggestions excluded', () => {
    it('bugs exclude suggestions: blocking 3 + warnings 5 → Bugs Caught 8', () => {
      const viewModel = present(
        ProjectStatsFactory.create({
          totalReviews: 5,
          totalBlocking: 3,
          totalWarnings: 5,
        }),
      );

      expect(viewModel.bugsCaught.value).toBe(8);
    });
  });

  describe('the reviews-over-time chart plots reviews per month across the trailing twelve months', () => {
    it('monthly volume: reviews dated across the year produce one point per trailing month', () => {
      const reviews = [
        ReviewStatsFactory.create({ id: 'jan', timestamp: '2024-01-10T10:00:00Z' }),
        ReviewStatsFactory.create({ id: 'jan-2', timestamp: '2024-01-20T10:00:00Z' }),
        ReviewStatsFactory.create({ id: 'jun', timestamp: '2024-06-05T10:00:00Z' }),
        ReviewStatsFactory.create({ id: 'dec', timestamp: '2024-12-01T10:00:00Z' }),
      ];

      const viewModel = present(ProjectStatsFactory.withReviews(reviews));

      expect(viewModel.reviewsPerMonth).toHaveLength(12);
      const byMonth = new Map(viewModel.reviewsPerMonth.map((point) => [point.month, point.count]));
      expect(byMonth.get('2024-01')).toBe(2);
      expect(byMonth.get('2024-06')).toBe(1);
      expect(byMonth.get('2024-12')).toBe(1);
      expect(byMonth.get('2024-03')).toBe(0);
    });
  });

  describe('a KPI card shows a delta only when there is enough history', () => {
    it('delta hidden on thin history: every kpi delta is null', () => {
      const viewModel = present(
        ProjectStatsFactory.withReviews([ReviewStatsFactory.create({ id: 'only' })]),
      );

      expect(viewModel.prsReviewed.delta).toBeNull();
      expect(viewModel.bugsCaught.delta).toBeNull();
      expect(viewModel.averageReviewTime.delta).toBeNull();
    });
  });

  describe('a project with no reviews shows an empty state', () => {
    it('empty project: flags the empty state with the French message', () => {
      const viewModel = present(ProjectStatsFactory.create());

      expect(viewModel.isEmpty).toBe(true);
      expect(viewModel.emptyMessage).toBe('Aucune review enregistrée');
    });
  });

  describe('the analytics header is exposed on GET /api/stats', () => {
    let app: FastifyInstance;

    afterEach(async () => {
      await app.close();
    });

    it('carries the analyticsHeader view model in the single-project payload', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({
          totalReviews: 43,
          totalBlocking: 16,
          totalWarnings: 41,
          averageDuration: 252000,
        }),
      );

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/known/project' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.analyticsHeader.isEmpty).toBe(false);
      expect(body.analyticsHeader.prsReviewed.value).toBe(43);
      expect(body.analyticsHeader.bugsCaught.value).toBe(57);
      expect(body.analyticsHeader.averageReviewTime.value).toBe('4m');
    });

    it('flags the empty analyticsHeader state when the project has no reviews', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats('/empty/project', ProjectStatsFactory.create());

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/empty/project' });

      const body = response.json();
      expect(body.analyticsHeader.isEmpty).toBe(true);
      expect(body.analyticsHeader.emptyMessage).toBe('Aucune review enregistrée');
    });
  });
});
