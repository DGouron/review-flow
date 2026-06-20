/**
 * SPEC-206 — Fix the GitLab change-size source
 *
 * Outer-loop acceptance test (SDD): drives the REAL GitLabDiffStatsFetchGateway
 * through the production fetchDiffStatsSafely helper with a stubbed
 * SimpleCommandExecutor and a pino silent logger.
 *
 * Scenarios from docs/specs/206-fix-gitlab-diff-stats-source.md:
 *   1. gitlab with changes  → real additions/deletions, no warning
 *   2. gitlab no diff summary → no change-size data + warning logged
 *   3. gitlab fetch error    → no change-size data + warning logged
 *
 * GitHub-unchanged (rule 4 / scenario "github unchanged") is covered by the
 * untouched GitHub gateway unit test — no new acceptance needed here.
 */

import { pino, type Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import { fetchDiffStatsSafely } from '@/modules/statistics-insights/services/fetchDiffStatsSafely.js';

function graphqlEnvelope(diffStatsSummary: unknown): string {
  return JSON.stringify({ data: { project: { mergeRequest: { diffStatsSummary } } } });
}

describe('Acceptance — SPEC-206: Fix the GitLab change-size source', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
  });

  describe('Rule: a merge request that exposes a diff summary yields its real additions and deletions', () => {
    it('gitlab with changes: returns real additions/deletions without logging a warning', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const executor = (command: string): string => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'c1' }, { id: 'c2' }]);
        }
        return graphqlEnvelope({ additions: 629, deletions: 3, fileCount: 11 });
      };

      const gateway = new GitLabDiffStatsFetchGateway(executor);
      const fetched = fetchDiffStatsSafely(gateway, 'group/proj', 5444, logger);

      expect(fetched).toEqual({ commitsCount: 2, additions: 629, deletions: 3 });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Rule: a fetch with no usable diff summary yields no change-size data and is logged as a warning', () => {
    it('gitlab no diff summary: returns null and logs a warning once', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const executor = (command: string): string => {
        if (command.includes('/commits')) {
          return JSON.stringify([{ id: 'c1' }]);
        }
        return JSON.stringify({ data: { project: { mergeRequest: null } } });
      };

      const gateway = new GitLabDiffStatsFetchGateway(executor);
      const fetched = fetchDiffStatsSafely(gateway, 'group/proj', 9999, logger);

      expect(fetched).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('gitlab fetch error: returns null and logs a warning once', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const executor = (): string => {
        throw new Error('glab unreachable');
      };

      const gateway = new GitLabDiffStatsFetchGateway(executor);
      const fetched = fetchDiffStatsSafely(gateway, 'missing', 1, logger);

      expect(fetched).toBeNull();
      expect(warnSpy).toHaveBeenCalledOnce();
    });
  });
});
