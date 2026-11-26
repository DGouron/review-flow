/**
 * SPEC-178 — Reposition Project Tabs Above Cards + Project-Contextual Cards
 *
 * Outer-loop acceptance test (SDD): filesystem-grep assertions on
 * src/dashboard/index.html and src/dashboard/styles.css to verify the DOM
 * surgery and CSS additions, plus dynamic-import contract tests on the
 * pure helper src/dashboard/modules/cardCounters.js.
 *
 * Source of truth: docs/specs/178-dashboard-tabs-reposition.md (15 scenarios).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { computeCardCounters } from '@/dashboard/modules/cardCounters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');
const STYLES_CSS_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'styles.css');

describe('SPEC-178 — Reposition Project Tabs Above Cards + Project-Contextual Cards', () => {
  let indexHtml: string;
  let stylesCss: string;

  beforeEach(() => {
    indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
    stylesCss = readFileSync(STYLES_CSS_PATH, 'utf-8');
  });

  // SPEC-230 superseded the project bar and the card counters: the project tabs
  // now live in the header project switcher and the queue tabs are the only counters.
  describe('Layout — project tabs stay together, outside any sidebar', () => {
    it('dashboard-tabs, manage-projects-toggle and manage-panel sit in the project switcher', () => {
      const switcherStart = indexHtml.indexOf('<div id="project-switcher-panel"');
      const switcherEnd = indexHtml.indexOf('<nav id="view-nav"');
      const switcherBlock = indexHtml.slice(switcherStart, switcherEnd);
      expect(switcherStart).toBeGreaterThan(-1);
      expect(switcherBlock).toMatch(/id="dashboard-tabs"/);
      expect(switcherBlock).toMatch(/id="manage-projects-toggle"/);
      expect(switcherBlock).toMatch(/id="manage-panel"/);
    });

    it('declares the project tabs exactly once', () => {
      expect(indexHtml.match(/id="dashboard-tabs"/g) ?? []).toHaveLength(1);
    });
  });

  describe('CSS — project-bar, scope marker, responsive, reduced motion', () => {
    it('declares a .project-bar selector', () => {
      expect(stylesCss).toMatch(/\.project-bar\b/);
    });

    it('declares a .cards-scope-marker selector', () => {
      expect(stylesCss).toMatch(/\.cards-scope-marker\b/);
    });

    it('declares a responsive wrap rule at max-width 900px touching project-bar', () => {
      const responsiveBlocks =
        stylesCss.match(/@media[^{]*max-width:\s*900px[^{]*\{[\s\S]*?\n\}/g) ?? [];
      const concatenated = responsiveBlocks.join('\n');
      expect(concatenated).toMatch(/\.project-bar/);
    });

    it('honors prefers-reduced-motion for project-bar or cards-scope-marker', () => {
      const reducedMotionBlocks =
        stylesCss.match(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\n\}/g) ?? [];
      const concatenated = reducedMotionBlocks.join('\n');
      expect(concatenated).toMatch(/\.project-bar|\.cards-scope-marker/);
    });
  });

  describe('Helper contract — overview and project scopes', () => {
    it('overview scope returns global counts and "TOUS LES PROJETS" marker', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [{}, {}, {}, {}, {}],
        scope: { kind: 'overview' },
      });

      expect(result.running).toBe(2);
      expect(result.queued).toBe(1);
      expect(result.completed).toBe(5);
      expect(result.markerLabel).toBe('TOUS LES PROJETS');
      expect(result.markerKind).toBe('overview');
    });

    it('project scope filters by localPath and uses uppercased projectName as marker', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [{}, {}],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.running).toBe(1);
      expect(result.queued).toBe(1);
      expect(result.completed).toBe(2);
      expect(result.markerLabel).toBe('A');
      expect(result.markerKind).toBe('project');
    });
  });
});
