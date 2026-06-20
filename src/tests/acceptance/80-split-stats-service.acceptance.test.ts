/**
 * SPEC-80 — Split statsService into Clean Architecture Layers
 *
 * Spec: docs/specs/80-split-stats-service.md
 * Plan: docs/plans/80-split-stats-service.plan.md
 *
 * Outer-loop acceptance test (SDD). Stays RED during the strangler refactoring,
 * GREEN once every responsibility of the old God Object lives in its proper
 * layer:
 *   - parseReviewOutput (sc. 4-7) → entities/stats/reviewOutput.parser.ts
 *   - AddReviewStatsUseCase (sc. 8-10, 16) → usecases/stats/addReviewStats.usecase.ts
 *   - GetProjectStatsUseCase (sc. 15) → usecases/stats/getProjectStats.usecase.ts
 *   - StatsSummaryPresenter (sc. 11-13) → presenters/statsSummary.presenter.ts
 *   - backward compatibility (sc. 14): an OLD-format stats.json fixture loads
 *     through FileSystemStatsGateway and flows unchanged
 *   - GET /api/stats response shape unchanged (sc. 15) via the real statsRoutes
 *   - Definition-of-Done gate: ZERO `services/statsService` imports remain in src/
 */

import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { parseReviewOutput } from '@/modules/statistics-insights/entities/stats/reviewOutput.parser.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { StatsSummaryPresenter } from '@/modules/statistics-insights/interface-adapters/presenters/statsSummary.presenter.js';
import { AddReviewStatsUseCase } from '@/modules/statistics-insights/usecases/stats/addReviewStats.usecase.js';
import { GetProjectStatsUseCase } from '@/modules/statistics-insights/usecases/stats/getProjectStats.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

const STRUCTURED_OUTPUT = '[REVIEW_STATS:blocking=2:warnings=3:suggestions=1:score=7.5]';

describe('Acceptance — SPEC-80: Split statsService into Clean Architecture layers', () => {
  describe('parseReviewOutput extracts structured stats from raw review output', () => {
    it('structured line: returns the parsed score and issue counts', () => {
      const parsed = parseReviewOutput(STRUCTURED_OUTPUT);

      expect(parsed).toEqual({
        score: 7.5,
        blocking: 2,
        warnings: 3,
        suggestions: 1,
        categoryBreakdown: null,
      });
    });

    it('summary format: returns the score, blocking and warnings counts', () => {
      const parsed = parseReviewOutput(
        ['Score global : 8/10', '🚨 Bloquants : 2', '⚠️ Importants : 3'].join('\n'),
      );

      expect(parsed.score).toBe(8);
      expect(parsed.blocking).toBe(2);
      expect(parsed.warnings).toBe(3);
    });

    it('inline markers: counts BLOQUANT, IMPORTANT and SUGGESTION fallbacks', () => {
      const parsed = parseReviewOutput(
        ['🚨 [BLOQUANT] a', '🚨 [BLOQUANT] b', '⚠️ [IMPORTANT] c', '💡 [SUGGESTION] d'].join('\n'),
      );

      expect(parsed.blocking).toBe(2);
      expect(parsed.warnings).toBe(1);
      expect(parsed.suggestions).toBe(1);
    });

    it('empty output: returns null score and zero counts', () => {
      const parsed = parseReviewOutput('');

      expect(parsed).toEqual({
        score: null,
        blocking: 0,
        warnings: 0,
        suggestions: 0,
        categoryBreakdown: null,
      });
    });
  });

  describe('AddReviewStatsUseCase records a review through the gateway', () => {
    it('nominal: persists one review with correct aggregates', () => {
      const statsGateway = new InMemoryStatsGateway();
      const useCase = new AddReviewStatsUseCase(statsGateway);

      const review = useCase.execute({
        projectPath: '/project',
        mrNumber: 42,
        duration: 60000,
        parsed: { score: 8, blocking: 1, warnings: 2, suggestions: 3, categoryBreakdown: null },
      });

      expect(review.mrNumber).toBe(42);

      const stats = statsGateway.loadProjectStats('/project');
      expect(stats?.totalReviews).toBe(1);
      expect(stats?.averageScore).toBe(8);
      expect(stats?.totalBlocking).toBe(1);
      expect(stats?.totalWarnings).toBe(2);
    });

    it('100-review cap: keeps exactly 100 reviews while counting the total', () => {
      const statsGateway = new InMemoryStatsGateway();
      const reviews = Array.from({ length: 100 }, (_, index) =>
        ReviewStatsFactory.create({ id: `review-${index}`, mrNumber: index + 1, score: 7 }),
      );
      statsGateway.saveProjectStats(
        '/project',
        ProjectStatsFactory.create({
          totalReviews: 100,
          totalScoreSum: 700,
          scoredReviewCount: 100,
          averageScore: 7,
          reviews,
        }),
      );

      new AddReviewStatsUseCase(statsGateway).execute({
        projectPath: '/project',
        mrNumber: 101,
        duration: 60000,
        parsed: parseReviewOutput(STRUCTURED_OUTPUT),
      });

      const stats = statsGateway.loadProjectStats('/project');
      expect(stats?.totalReviews).toBe(101);
      expect(stats?.reviews).toHaveLength(100);
    });

    it('null score: excludes null scores from the average', () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats(
        '/project',
        ProjectStatsFactory.create({
          totalReviews: 2,
          totalScoreSum: 14,
          scoredReviewCount: 2,
          averageScore: 7,
          reviews: [
            ReviewStatsFactory.create({ id: 'r1', score: 6 }),
            ReviewStatsFactory.create({ id: 'r2', score: 8 }),
          ],
        }),
      );

      new AddReviewStatsUseCase(statsGateway).execute({
        projectPath: '/project',
        mrNumber: 3,
        duration: 60000,
        parsed: { score: null, blocking: 0, warnings: 0, suggestions: 0, categoryBreakdown: null },
      });

      const stats = statsGateway.loadProjectStats('/project');
      expect(stats?.averageScore).toBe(7);
      expect(stats?.totalReviews).toBe(3);
    });
  });

  describe('StatsSummaryPresenter formats durations and trends', () => {
    it('duration: formats total and average review time', () => {
      const stats = ProjectStatsFactory.create({
        totalDuration: 7500000,
        averageDuration: 150000,
      });

      const summary = new StatsSummaryPresenter().present(stats);

      expect(summary.totalTime).toBe('2h 5m');
      expect(summary.averageTime).toBe('2m');
    });

    it('score trend up: recent reviews clearly beat the previous window', () => {
      const previous = Array.from({ length: 5 }, (_, index) =>
        ReviewStatsFactory.create({ id: `p${index}`, score: 6, blocking: 1 }),
      );
      const recent = Array.from({ length: 5 }, (_, index) =>
        ReviewStatsFactory.create({ id: `r${index}`, score: 8, blocking: 1 }),
      );
      const stats = ProjectStatsFactory.withReviews([...previous, ...recent]);

      const summary = new StatsSummaryPresenter().present(stats);

      expect(summary.trend.score).toBe('up');
    });

    it('insufficient data: keeps both trends stable', () => {
      const stats = ProjectStatsFactory.withReviews([
        ReviewStatsFactory.create({ id: 'a', score: 8 }),
        ReviewStatsFactory.create({ id: 'b', score: 8 }),
      ]);

      const summary = new StatsSummaryPresenter().present(stats);

      expect(summary.trend.score).toBe('stable');
      expect(summary.trend.blocking).toBe('stable');
    });
  });

  describe('existing stats.json files remain backward compatible', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = join(tmpdir(), `reviewflow-spec80-${Date.now()}-${Math.random()}`);
      mkdirSync(join(projectPath, '.claude', 'reviews'), { recursive: true });
    });

    afterEach(() => {
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
    });

    it('old format: loads, records a new review, and presents a summary unchanged', () => {
      const legacyStats = {
        totalReviews: 2,
        totalDuration: 120000,
        averageScore: 7,
        averageDuration: 60000,
        totalBlocking: 1,
        totalWarnings: 3,
        reviews: [
          {
            id: 'legacy-1',
            timestamp: '2024-01-01T10:00:00Z',
            mrNumber: 1,
            duration: 60000,
            score: 7,
            blocking: 0,
            warnings: 1,
          },
          {
            id: 'legacy-2',
            timestamp: '2024-01-02T10:00:00Z',
            mrNumber: 2,
            duration: 60000,
            score: 7,
            blocking: 1,
            warnings: 2,
          },
        ],
        lastUpdated: '2024-01-02T10:00:00Z',
        totalAdditions: 0,
        totalDeletions: 0,
        averageAdditions: null,
        averageDeletions: null,
      };
      writeFileSync(
        join(projectPath, '.claude', 'reviews', 'stats.json'),
        JSON.stringify(legacyStats, null, 2),
        'utf-8',
      );

      const statsGateway = new FileSystemStatsGateway();
      const loaded = statsGateway.loadProjectStats(projectPath);
      expect(loaded?.totalReviews).toBe(2);
      expect(loaded?.reviews).toHaveLength(2);

      new AddReviewStatsUseCase(statsGateway).execute({
        projectPath,
        mrNumber: 3,
        duration: 60000,
        parsed: parseReviewOutput(STRUCTURED_OUTPUT),
      });

      const after = new GetProjectStatsUseCase(statsGateway).execute({ projectPath });
      expect(after?.totalReviews).toBe(3);

      const summary = new StatsSummaryPresenter().present(
        after ?? loaded ?? ProjectStatsFactory.create(),
      );
      expect(summary.totalReviews).toBe(3);
      expect(typeof summary.averageScore).toBe('string');
    });
  });

  describe('GET /api/stats response shape is unchanged', () => {
    let app: FastifyInstance;

    afterEach(async () => {
      await app.close();
    });

    it('present project: returns stats + summary, with summary from the presenter', async () => {
      const statsGateway = new InMemoryStatsGateway();
      statsGateway.saveProjectStats(
        '/known/project',
        ProjectStatsFactory.create({ totalReviews: 5, averageScore: 7.5 }),
      );

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/known/project' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.stats.totalReviews).toBe(5);
      expect(body.summary.totalReviews).toBe(5);
      expect(body.summary.averageScore).toBe('7.5');
    });

    it('absent project: returns { stats: null, summary: null }', async () => {
      const statsGateway = new InMemoryStatsGateway();

      app = Fastify();
      await app.register(statsRoutes, { statsGateway, getRepositories: () => [] });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stats?path=/missing/project' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ stats: null, summary: null });
    });
  });

  describe('Definition of Done: the God Object no longer exists', () => {
    it('no source file imports services/statsService', () => {
      const matches = execSync(
        "grep -rln \"from '@/modules/statistics-insights/services/statsService\" src/ | grep -v '80-split-stats-service.acceptance.test.ts' || true",
        { encoding: 'utf-8' },
      ).trim();

      expect(matches).toBe('');
    });
  });
});
