import { describe, it, expect } from 'vitest';

import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { buildAiInsightsPrompt } from '@/modules/statistics-insights/usecases/insights/buildAiInsightsPrompt.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';

function createReviewContent(mrNumber: number, score: number): string {
  return `# Code Review - MR !${mrNumber} (feature: something)

## Executive Summary

| Audit | Score |
|-------|-------|
| Clean Architecture | ${score}/10 |

**Score Global : ${score}/10** -- Good review.

## Corrections Bloquantes

### 1. Missing error handling

Some blocking issue description.

## Constats Positifs

| Aspect | Note |
|--------|------|
| Testing | 9/10 |
`;
}

describe('buildAiInsightsPrompt', () => {
  it('should include developer name in the prompt', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
  });

  it('should include the ready rate and the grades of each developer', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', verdict: 'ready', grade: 'A' }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', verdict: 'changes', grade: 'C' }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'alice', verdict: 'ready', grade: 'B' }),
      ReviewStatsFactory.create({ id: 'r4', assignedBy: 'alice', verdict: 'stopped', grade: 'E' }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('- Ready at first review: 50% (2 of 4 judged reviews)');
    expect(prompt).toContain('- Grades: A 1, B 1, C 1, D 0, E 1');
    expect(prompt).not.toMatch(/score/i);
  });

  it('should include the team ready rate', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', verdict: 'ready', grade: 'A' }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'bob', verdict: 'changes', grade: 'D' }),
      ReviewStatsFactory.create({ id: 'r3', assignedBy: 'bob', verdict: 'changes', grade: 'C' }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('- Team ready at first review: 33%');
  });

  it('should ask the summary to mention the ready rate, never a score out of 10', () => {
    const prompt = buildAiInsightsPrompt({
      reviews: [ReviewStatsFactory.create({ assignedBy: 'alice', verdict: 'ready', grade: 'A' })],
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain(
      `"summary" must mention the developer's ready-at-first-review rate and key characteristic`,
    );
    expect(prompt).not.toContain('/10');
  });

  it('should include review content for recent reviews', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 42, score: 8 }),
    ];

    const reviewContents = new Map<string, string>();
    reviewContents.set('42', createReviewContent(42, 8));

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('Missing error handling');
  });

  it('should include tracked MR lifecycle data', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const trackedMrs: TrackedMr[] = [
      TrackedMrFactory.create({
        assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' },
        totalReviews: 3,
        totalFollowups: 1,
      }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs,
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).toMatch(/total.*reviews|reviews.*total/i);
  });

  it('should specify the output language', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const promptFr = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(promptFr).toContain('French');

    const promptEn = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(promptEn).toContain('English');
  });

  it('should request JSON output format', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('developerName');
    expect(prompt).toContain('titleExplanation');
  });

  it('should handle multiple developers', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'bob', mrNumber: 2, score: 6 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).toContain('bob');
  });

  it('should skip reviews without assignedBy', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: undefined, mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: 7 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).not.toContain('Developer: unknown');
  });

  it('should truncate review content for older reviews', () => {
    const reviews: ReviewStats[] = Array.from({ length: 10 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `r${index}`,
        assignedBy: 'alice',
        mrNumber: index + 1,
        score: 7,
        timestamp: new Date(2026, 0, index + 1).toISOString(),
      }),
    );

    const reviewContents = new Map<string, string>();
    for (let index = 1; index <= 10; index++) {
      reviewContents.set(String(index), createReviewContent(index, 7));
    }

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.length).toBeLessThan(200000);
  });

  it('should report N/A readiness when no review is judged', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: null }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: null }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('- Ready at first review: N/A (0 of 0 judged reviews)');
    expect(prompt).toContain('- Team ready at first review: N/A');
  });

  it('should format review duration in hours when at least 60 minutes', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({
        id: 'r1',
        assignedBy: 'alice',
        mrNumber: 1,
        score: 7,
        duration: 5_400_000,
      }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('Average review duration: 1h 30min');
  });

  it('should not emit excerpt section when review content has no recognizable sections', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 7, score: 8 }),
    ];

    const reviewContents = new Map<string, string>();
    reviewContents.set('7', 'Just a plain note without any structured headings.');

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).not.toContain('Recent review excerpts:');
    expect(prompt).not.toContain('--- MR 7');
  });

  it('should not emit excerpt section when no content is mapped for the review', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 99, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).not.toContain('Recent review excerpts:');
  });

  it('should aggregate multiple tracked MRs for the same developer', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const trackedMrs: TrackedMr[] = [
      TrackedMrFactory.create({
        id: 'mr-1',
        assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' },
        totalReviews: 1,
        totalFollowups: 0,
        state: 'approved',
      }),
      TrackedMrFactory.create({
        id: 'mr-2',
        assignment: { username: 'alice', assignedAt: '2024-01-16T10:00:00Z' },
        totalReviews: 2,
        totalFollowups: 1,
        state: 'pending-review',
      }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs,
      language: 'en',
    });

    expect(prompt).toContain('Total MRs: 2');
    expect(prompt).toContain('Total reviews across MRs: 3');
    expect(prompt).toContain('Total followups: 1');
    expect(prompt).toContain('MRs approved on first review: 1');
  });

  it('should not emit MR lifecycle section when developer has no tracked MRs', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const trackedMrs: TrackedMr[] = [
      TrackedMrFactory.create({
        assignment: { username: 'bob', assignedAt: '2024-01-15T10:00:00Z' },
      }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs,
      language: 'en',
    });

    expect(prompt).not.toContain('### MR Lifecycle for alice:');
  });

  it('should extract executive summary and positive observations into the excerpt', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 5, score: 9 }),
    ];

    const content = `## Synthèse Exécutive

| Audit | Score |
|-------|-------|
| Clean Architecture | 9/10 |

## Corrections Bloquantes

### 1. Race condition in queue

## Constats Positifs

### 1. Excellent test coverage
`;

    const reviewContents = new Map<string, string>();
    reviewContents.set('5', content);

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('Synthèse Exécutive');
    expect(prompt).toContain('Corrections: ### 1. Race condition in queue');
    expect(prompt).toContain('Points positifs: ### 1. Excellent test coverage');
  });

  it('should treat missing diffStats as zero additions and deletions', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('Total additions: 0, deletions: 0');
  });

  it('should report a 0% ready rate for legacy reviews that all had findings', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 9 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: 6 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('- Ready at first review: 0% (0 of 2 judged reviews)');
  });

  it('should label the excerpt MR verdict and grade as N/A when the review is not judged', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 13, score: null }),
    ];

    const reviewContents = new Map<string, string>();
    reviewContents.set('13', createReviewContent(13, 8));

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('--- MR 13 (verdict: N/A, grade: N/A) ---');
  });

  it('should label the excerpt MR with its verdict and grade', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({
        assignedBy: 'alice',
        mrNumber: 42,
        verdict: 'changes',
        grade: 'C',
      }),
    ];
    const reviewContents = new Map<string, string>();
    reviewContents.set('42', createReviewContent(42, 8));

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('--- MR 42 (verdict: changes, grade: C) ---');
    expect(prompt).not.toContain('Score Global');
  });

  it('should ignore a blocking-corrections section that has no numbered titles', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 21, score: 8 }),
    ];

    const content = `## Synthèse Exécutive

| Audit | Score |
|-------|-------|
| Clean Architecture | 8/10 |

## Corrections Bloquantes

No numbered items here, just prose.

## Constats Positifs

Only prose, no numbered titles.
`;

    const reviewContents = new Map<string, string>();
    reviewContents.set('21', content);

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'en',
    });

    expect(prompt).toContain('Synthèse Exécutive');
    expect(prompt).not.toContain('Corrections: ');
    expect(prompt).not.toContain('Points positifs: ');
  });
});
