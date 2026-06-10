import { describe, expect, it } from 'vitest';

import { renderOverviewHtml, renderSparklineSvg } from '@/dashboard/modules/overview.js';

describe('renderOverviewHtml', () => {
  it('falls back to French empty defaults when sections are missing from server payload', () => {
    const html = renderOverviewHtml({});

    expect(html).toContain('Aucune review en cours');
    expect(html).toContain('Aucun projet configuré');
    expect(html).toContain('Aucune review récente');
  });

  it('falls back to empty defaults when payload is null', () => {
    const html = renderOverviewHtml(null);

    expect(html).toContain('Aucune review en cours');
  });

  it('strips javascript: scheme from mrUrl when rendering active review row', () => {
    const html = renderOverviewHtml({
      activeReviews: {
        items: [
          {
            jobId: 'job-1',
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            mrPrefix: 'MR',
            mrNumber: 1,
            mrUrl: 'javascript:alert(1)',
            elapsedLabel: '3m',
            jobType: 'review',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucune review en cours',
      },
      projectCards: { items: [], isEmpty: true, emptyMessage: 'Aucun projet configuré' },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('renders the three sections with their LABEL prefix headings', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: { items: [], isEmpty: true, emptyMessage: 'Aucun projet configuré' },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).toContain('// ACTIVE REVIEWS');
    expect(html).toContain('// PROJECTS');
    expect(html).toContain('// RECENT REVIEWS');
  });

  it('renders the empty message for each section when isEmpty is true', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: { items: [], isEmpty: true, emptyMessage: 'Aucun projet configuré' },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).toContain('Aucune review en cours');
    expect(html).toContain('Aucun projet configuré');
    expect(html).toContain('Aucune review récente');
  });

  it('renders one active review row with project name, MR number and elapsed label', () => {
    const html = renderOverviewHtml({
      activeReviews: {
        items: [
          {
            jobId: 'gitlab:frontend:142',
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            mrPrefix: 'MR',
            mrNumber: 142,
            mrUrl: 'https://gitlab.com/org/frontend/-/merge_requests/142',
            elapsedLabel: '3m',
            jobType: 'review',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucune review en cours',
      },
      projectCards: { items: [], isEmpty: true, emptyMessage: 'Aucun projet configuré' },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).toContain('frontend');
    expect(html).toContain('MR #142');
    expect(html).toContain('3m');
    expect(html).toContain('https://gitlab.com/org/frontend/-/merge_requests/142');
  });

  it('renders one project card with name, totals, score, sparkline and data-project-path for click navigation', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            platform: 'gitlab',
            totalReviews: 24,
            averageScoreLabel: '7.2',
            sparklinePoints: [6, 7, 8, 7, 9],
            isEmptyHistory: false,
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).toContain('data-project-path="/repos/frontend"');
    expect(html).toContain('frontend');
    expect(html).toContain('24 reviews');
    expect(html).toContain('Score 7.2');
    expect(html).toContain('<polyline');
  });

  it('does not render a polyline when a project has no sparkline points', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'new-project',
            projectPath: '/repos/new',
            platform: 'gitlab',
            totalReviews: 0,
            averageScoreLabel: '-',
            sparklinePoints: [],
            isEmptyHistory: true,
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).not.toContain('<polyline');
    expect(html).toContain('0 reviews');
    expect(html).toContain('Score -');
  });

  it('renders an external-link anchor on the project card when externalLink is an HTTPS url (SPEC-179)', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            platform: 'gitlab',
            totalReviews: 1,
            averageScoreLabel: '7.0',
            sparklinePoints: [7],
            isEmptyHistory: false,
            externalLink: 'https://notion.so/team/projet',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).toContain('href="https://notion.so/team/projet"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('project-card__external');
  });

  it('omits the external-link anchor when externalLink is missing or empty (SPEC-179)', () => {
    const htmlMissing = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            platform: 'gitlab',
            totalReviews: 0,
            averageScoreLabel: '-',
            sparklinePoints: [],
            isEmptyHistory: true,
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });
    expect(htmlMissing).not.toContain('project-card__external');

    const htmlEmpty = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            platform: 'gitlab',
            totalReviews: 0,
            averageScoreLabel: '-',
            sparklinePoints: [],
            isEmptyHistory: true,
            externalLink: '',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });
    expect(htmlEmpty).not.toContain('project-card__external');
  });

  it('strips javascript: scheme from externalLink even if it sneaks through the server (SPEC-179 defense in depth)', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: {
        items: [
          {
            projectName: 'frontend',
            projectPath: '/repos/frontend',
            platform: 'gitlab',
            totalReviews: 1,
            averageScoreLabel: '5.0',
            sparklinePoints: [5],
            isEmptyHistory: false,
            externalLink: 'javascript:alert(1)',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: { items: [], isEmpty: true, emptyMessage: 'Aucune review récente' },
    });

    expect(html).not.toContain('javascript:');
  });

  it('renders the recent reviews feed with project name, MR prefix and number', () => {
    const html = renderOverviewHtml({
      activeReviews: { items: [], isEmpty: true, emptyMessage: 'Aucune review en cours' },
      projectCards: { items: [], isEmpty: true, emptyMessage: 'Aucun projet configuré' },
      recentReviewsFeed: {
        items: [
          {
            filename: '2026-05-25-MR-1.md',
            projectName: 'frontend',
            mrPrefix: 'MR',
            mrNumber: '1',
            title: 'feat: dashboard',
            mtime: '2026-05-25T11:59:00.000Z',
          },
        ],
        isEmpty: false,
        emptyMessage: 'Aucune review récente',
      },
    });

    expect(html).toContain('frontend');
    expect(html).toContain('MR #1');
    expect(html).toContain('feat: dashboard');
  });
});

describe('renderSparklineSvg', () => {
  it('returns an empty string when no points are provided', () => {
    expect(renderSparklineSvg([])).toBe('');
  });

  it('returns an SVG with one <polyline> for non-empty points', () => {
    const svg = renderSparklineSvg([5, 6, 7, 8]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('points="');
  });

  it('produces N coordinate pairs in the polyline points attribute', () => {
    const svg = renderSparklineSvg([5, 6, 7, 8]);
    const pointsMatch = svg.match(/points="([^"]+)"/);
    expect(pointsMatch).not.toBeNull();
    const pairs = pointsMatch !== null ? pointsMatch[1].trim().split(/\s+/) : [];
    expect(pairs).toHaveLength(4);
  });
});
