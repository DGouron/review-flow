import { describe, it, expect } from 'vitest';

import { retrieveReviewReport } from '@/modules/claude-invocation/usecases/retrieveReviewReport.usecase.js';
import { ClaudeSessionFactory } from '@/tests/factories/claudeSession.factory.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';

describe('retrieveReviewReport use case', () => {
  it('returns the report content when the file exists', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport({
      content: '# Review',
      path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
    });

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create(),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.content).toBe('# Review');
    }
  });

  it('returns "missing" with the expected path when the file is absent', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport(null);

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create(),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.expectedPath).toContain('2026-05-22-MR-42-review.md');
    }
  });

  it('uses the followup suffix for followup job type', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport(null);

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create({ jobType: 'followup' }),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.expectedPath).toContain('followup');
    }
  });

  it('falls back to fallbackLocalPath when the primary location is missing', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReadStrategy((location) => {
      if (location.localPath === '/wt/repo/frontend') return null;
      if (location.localPath === '/wt/repo') {
        return {
          content: '# Fallback found',
          path: '/wt/repo/.claude/reviews/2026-05-22-MR-42-review.md',
        };
      }
      return null;
    });

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create({ localPath: '/wt/repo/frontend' }),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
        fallbackLocalPath: '/wt/repo',
      },
      { reportGateway },
    );

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.content).toBe('# Fallback found');
      expect(result.path).toBe('/wt/repo/.claude/reviews/2026-05-22-MR-42-review.md');
    }
  });

  it('does not query the fallback when the primary location resolves', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReadStrategy(() => ({
      content: '# Primary',
      path: '/wt/repo/frontend/.claude/reviews/2026-05-22-MR-42-review.md',
    }));

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create({ localPath: '/wt/repo/frontend' }),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
        fallbackLocalPath: '/wt/repo',
      },
      { reportGateway },
    );

    expect(result.status).toBe('found');
    expect(reportGateway.readCallCount).toBe(1);
  });

  it('ignores fallbackLocalPath when it equals the primary path', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport(null);

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create({ localPath: '/wt/repo' }),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
        fallbackLocalPath: '/wt/repo',
      },
      { reportGateway },
    );

    expect(result.status).toBe('missing');
    expect(reportGateway.readCallCount).toBe(1);
  });
});
