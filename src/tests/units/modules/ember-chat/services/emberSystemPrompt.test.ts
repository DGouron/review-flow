import { describe, it, expect } from 'vitest';

import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import type { EmberGrounding } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import {
  EmberMemoryFactory,
  EmberMemoryTurnFactory,
} from '@/tests/factories/emberMemory.factory.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const EMPTY_GROUNDING: EmberGrounding = {
  reviewScores: null,
  insights: null,
  jobHistory: null,
  worktrees: [],
  memory: null,
};

const PROJECT_PATH = '/projects/alpha';

describe('buildEmberSystemPrompt', () => {
  it('names the four review-data sources as the only data sources', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);
    expect(prompt).toContain('reviewScores');
    expect(prompt).toContain('insights');
    expect(prompt).toContain('jobHistory');
    expect(prompt).toContain('worktrees');
  });

  it('instructs to decline rather than invent when asked outside review data', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);
    expect(prompt.toLowerCase()).toContain('review');
    expect(prompt).toMatch(/ne sait répondre|ne sais pas|reviews/i);
  });

  it('instructs it stays read-only and performs no writes', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);
    expect(prompt.toLowerCase()).toContain('lecture seule');
    expect(prompt).toMatch(/n'effectue aucune écriture/i);
  });

  it('identifies the assistant as Ember', () => {
    expect(buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH)).toContain('Ember');
  });

  it('embeds the actual review data so the answer is grounded in it', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews([
        ReviewStatsFactory.create({ mrNumber: 42, score: 3, blocking: 4, warnings: 1 }),
      ]),
    };

    expect(buildEmberSystemPrompt(grounding, PROJECT_PATH)).toContain('42');
  });

  it('bounds the prompt under a ceiling even for a huge review history', () => {
    const reviews = Array.from({ length: 500 }, (_, index) =>
      ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
    );
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews(reviews),
    };

    expect(buildEmberSystemPrompt(grounding, PROJECT_PATH).length).toBeLessThan(60_000);
  });

  it('keeps the aggregates and the most-recent reviews when capping a huge history', () => {
    const reviews = Array.from({ length: 500 }, (_, index) =>
      ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
    );
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews(reviews),
    };

    const prompt = buildEmberSystemPrompt(grounding, PROJECT_PATH);

    expect(prompt).toContain('"totalReviews":500');
    expect(prompt).toContain('"mrNumber":499');
    expect(prompt).not.toContain('"mrNumber":0');
  });

  it('does not declare the filesystem off-limits or cap older reviews as a ceiling', () => {
    const reviews = Array.from({ length: 500 }, (_, index) =>
      ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
    );
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews(reviews),
    };

    const prompt = buildEmberSystemPrompt(grounding, PROJECT_PATH);

    expect(prompt).not.toContain('aucun autre accès');
    expect(prompt).not.toContain('ni système de fichiers');
    expect(prompt).not.toContain('résumé agrégé seulement');
  });

  it('permits reading the project review data on demand for items beyond the snapshot', () => {
    const reviews = Array.from({ length: 500 }, (_, index) =>
      ReviewStatsFactory.create({ mrNumber: index, score: index % 10 }),
    );
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews(reviews),
    };

    const prompt = buildEmberSystemPrompt(grounding, PROJECT_PATH);

    expect(prompt.toLowerCase()).toContain('à la demande');
    expect(prompt).toMatch(/peux\s+lire|tu\s+peux\s+consulter/i);
    expect(prompt.toLowerCase()).toContain('point de départ');
  });

  it('omits any conversation-memory section when there is no prior memory', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);

    expect(prompt.toLowerCase()).not.toContain('conversation précédente');
  });

  it('renders prior conversation turns so a follow-up keeps context', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      memory: EmberMemoryFactory.create({
        turns: [
          EmberMemoryTurnFactory.create({
            question: 'Quel est le statut du projet X ?',
            answer: 'Le projet X régresse chaque vendredi.',
          }),
        ],
      }),
    };

    const prompt = buildEmberSystemPrompt(grounding, PROJECT_PATH);

    expect(prompt.toLowerCase()).toContain('conversation précédente');
    expect(prompt).toContain('Quel est le statut du projet X ?');
    expect(prompt).toContain('Le projet X régresse chaque vendredi.');
  });

  it('omits the conversation-memory section when memory holds no turns', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      memory: EmberMemoryFactory.create({ turns: [] }),
    };

    expect(buildEmberSystemPrompt(grounding, PROJECT_PATH).toLowerCase()).not.toContain(
      'conversation précédente',
    );
  });

  it('omits any recurring-insights section when there is no recorded insight', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      memory: EmberMemoryFactory.create({ turns: [], insights: [] }),
    };

    expect(buildEmberSystemPrompt(grounding, PROJECT_PATH).toLowerCase()).not.toContain(
      'constats récurrents',
    );
  });

  it('renders recorded recurring insights so Ember reuses them instead of recomputing', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      memory: EmberMemoryFactory.create({
        turns: [],
        insights: ['Le projet X régresse chaque vendredi.'],
      }),
    };

    const prompt = buildEmberSystemPrompt(grounding, PROJECT_PATH);

    expect(prompt.toLowerCase()).toContain('constats récurrents');
    expect(prompt).toContain('Le projet X régresse chaque vendredi.');
    expect(prompt.toLowerCase()).toMatch(/réutilise|sans .*recalcul/i);
  });

  it('instructs Ember to record a derived recurring finding via the record_insight tool', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);

    expect(prompt).toContain('record_insight');
    expect(prompt).toContain(PROJECT_PATH);
  });

  it('records only genuine recurring review findings, never arbitrary facts', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING, PROJECT_PATH);

    expect(prompt.toLowerCase()).toMatch(/constat.*récurrent|récurrent/i);
    expect(prompt.toLowerCase()).not.toContain('préférences');
  });
});
