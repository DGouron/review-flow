import { describe, it, expect, vi } from 'vitest';

import { ReviewReportFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/reviewReport.fileSystem.gateway.js';

describe('ReviewReportFileSystemGateway.buildPath', () => {
  it('uses the review suffix for review job type', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
      readdirSync: () => [],
    });

    const path = gateway.buildPath({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(path).toBe('/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md');
  });

  it('uses the followup suffix for followup job type', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
      readdirSync: () => [],
    });

    const path = gateway.buildPath({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'followup',
    });

    expect(path).toBe('/tmp/project/.claude/reviews/2026-05-22-MR-42-followup.md');
  });
});

describe('ReviewReportFileSystemGateway.read', () => {
  it('returns null when the file does not exist', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
      readdirSync: () => [],
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(result).toBe(null);
  });

  it('returns the file content when the file exists', () => {
    const readSpy = vi.fn(() => '# Hello');
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => true,
      readFileSync: readSpy,
      readdirSync: () => [],
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(result).toEqual({
      content: '# Hello',
      path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
    });
    expect(readSpy).toHaveBeenCalledOnce();
  });

  it('falls back to a pattern scan when the date prefix differs (timezone drift)', () => {
    const readSpy = vi.fn(() => '# Recovered');
    const gateway = new ReviewReportFileSystemGateway({
      // exact path miss, but the reviews directory exists.
      existsSync: (path: string) => path.endsWith('/.claude/reviews'),
      readFileSync: readSpy,
      readdirSync: () => ['2026-05-26-MR-206-review.md'],
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-25', // wrong (UTC), file is named with local date
      mergeRequestNumber: 206,
      jobType: 'review',
    });

    expect(result).toEqual({
      content: '# Recovered',
      path: '/tmp/project/.claude/reviews/2026-05-26-MR-206-review.md',
    });
  });

  it('ignores files for a different MR number during the scan', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: (path: string) => path.endsWith('/.claude/reviews'),
      readFileSync: () => 'unused',
      readdirSync: () => ['2026-05-26-MR-205-review.md', '2026-05-26-MR-207-followup.md'],
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-25',
      mergeRequestNumber: 206,
      jobType: 'review',
    });

    expect(result).toBe(null);
  });

  it('returns null when neither exact path nor reviews directory exists', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => 'unused',
      readdirSync: () => {
        throw new Error('readdirSync should not be called when the dir is absent');
      },
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-25',
      mergeRequestNumber: 206,
      jobType: 'review',
    });

    expect(result).toBe(null);
  });
});
