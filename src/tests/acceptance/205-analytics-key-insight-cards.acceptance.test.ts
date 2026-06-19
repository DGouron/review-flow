/**
 * SPEC-205 — Show key insight cards on the analytics overview
 *
 * Spec: docs/specs/205-analytics-key-insight-cards.md
 * Plan: docs/plans/205-analytics-key-insight-cards.plan.md
 *
 * Outer-loop acceptance test (SDD): mirrors the 6 scenarios defined in the
 * spec's `## Scenarios` block. Stays RED until the data path (deriver →
 * presenter → HTTP route) lands. Exercises the presenter directly and the
 * GET /api/stats payload via Fastify.inject against the in-memory stats
 * gateway, proving the slice satisfies the spec without touching
 * infrastructure.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, afterEach } from 'vitest';

import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { KeyInsightsPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/keyInsights.presenter.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const NOW = new Date('2024-12-15T12:00:00Z');

const daysBefore = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const reviewAt = (id: string, daysAgo: number, overrides: Partial<ReviewStats> = {}): ReviewStats =>
  ReviewStatsFactory.create({ id, timestamp: daysBefore(daysAgo), ...overrides });

const present = (
  reviews: ReviewStats[],
  extra: Partial<ReturnType<typeof ProjectStatsFactory.withReviews>> = {},
) =>
  new KeyInsightsPresenter().present(
    { ...ProjectStatsFactory.withReviews(reviews), ...extra },
    NOW,
  );

describe('Acceptance — SPEC-205: Show key insight cards on the analytics overview', () => {
  describe('a review-volume trend card states the recent-vs-previous change with magnitude', () => {
    it('volume rising: 12 reviews recently vs 6 before yields an increase card', () => {
      const recent = Array.from({ length: 12 }, (_, index) => reviewAt(`recent-${index}`, 5));
      const previous = Array.from({ length: 6 }, (_, index) => reviewAt(`previous-${index}`, 40));

      const viewModel = present([...previous, ...recent]);

      const volumeCard = viewModel.cards.find((card) => /volume/i.test(card.title));
      expect(volumeCard).toBeDefined();
      expect(volumeCard?.body).toContain('12');
      expect(volumeCard?.body).toContain('6');
      expect(volumeCard?.body).toContain('+100%');
    });
  });

  describe('the dominant-bug-category card names the top category and its count', () => {
    it('dominant category: security 4, logic 12, style 2 names Logic with count 12', () => {
      const viewModel = present([reviewAt('only', 5)], {
        categoryBreakdown: {
          security: 4,
          logic: 12,
          performance: 0,
          typeSafety: 0,
          style: 2,
          dependencies: 0,
        },
      });

      const categoryCard = viewModel.cards.find(
        (card) => /Logic/.test(card.title) || /Logic/.test(card.body),
      );
      expect(categoryCard).toBeDefined();
      expect(categoryCard?.body).toContain('12');
    });
  });

  describe('the review-time trend card states the direction and magnitude of the change', () => {
    it('review time improving: recent average below the previous period yields a drop card', () => {
      const recent = Array.from({ length: 5 }, (_, index) =>
        reviewAt(`recent-${index}`, 5, { duration: 180000 }),
      );
      const previous = Array.from({ length: 5 }, (_, index) =>
        reviewAt(`previous-${index}`, 40, { duration: 300000 }),
      );

      const viewModel = present([...previous, ...recent]);

      const timeCard = viewModel.cards.find((card) => /time/i.test(card.title));
      expect(timeCard).toBeDefined();
      expect(timeCard?.body).toContain('-40%');
    });
  });

  describe('the overview shows up to three cards, ranked most-notable first', () => {
    it('ranking and truncation: four eligible candidates surface only the top three', () => {
      const recent = Array.from({ length: 12 }, (_, index) =>
        reviewAt(`recent-${index}`, 5, { duration: 180000 }),
      );
      const previous = Array.from({ length: 6 }, (_, index) =>
        reviewAt(`previous-${index}`, 40, { duration: 300000 }),
      );

      const viewModel = present([...previous, ...recent], {
        categoryBreakdown: {
          security: 1,
          logic: 2,
          performance: 0,
          typeSafety: 0,
          style: 0,
          dependencies: 0,
        },
      });

      expect(viewModel.cards.length).toBeLessThanOrEqual(3);
      expect(viewModel.isEmpty).toBe(false);
    });
  });

  describe('a candidate without enough data is omitted', () => {
    it('not enough data: too few reviews, flat trends, and no categorized bugs omit every trend candidate', () => {
      const reviews = [reviewAt('a', 5), reviewAt('b', 6)];

      const viewModel = present(reviews);

      expect(viewModel.cards.every((card) => !/volume/i.test(card.title))).toBe(true);
      expect(viewModel.cards.every((card) => !/time/i.test(card.title))).toBe(true);
    });
  });

  describe('an empty state appears when no candidate qualifies', () => {
    it('empty: a project with no reviews shows the French empty message', () => {
      const viewModel = new KeyInsightsPresenter().present(ProjectStatsFactory.create(), NOW);

      expect(viewModel.isEmpty).toBe(true);
      expect(viewModel.emptyMessage).toBe('Aucun insight disponible pour le moment');
    });
  });

  describe('the key insights are exposed on GET /api/stats', () => {
    let app: FastifyInstance;

    afterEach(async () => {
      await app.close();
    });

    it('carries the keyInsights view model in the single-project payload', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({
          categoryBreakdown: {
            security: 0,
            logic: 4,
            performance: 0,
            typeSafety: 0,
            style: 0,
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
      expect(body.keyInsights.isEmpty).toBe(false);
      expect(body.keyInsights.cards.length).toBeGreaterThan(0);
    });

    it('flags the empty keyInsights state when the project has no reviews', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats('/empty/project', ProjectStatsFactory.create());

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/empty/project' });

      const body = response.json();
      expect(body.keyInsights.isEmpty).toBe(true);
      expect(body.keyInsights.emptyMessage).toBe('Aucun insight disponible pour le moment');
    });
  });
});
