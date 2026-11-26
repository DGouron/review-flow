/**
 * Dashboard shell layout — structural assertions on src/dashboard/index.html
 * via raw string + regex, as for the other dashboard layout tests (no jsdom).
 *
 * SPEC-230 replaces the SPEC-181 layout (sidebar, focus strip, stacked
 * sections) with three views, one review queue and a side panel.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');

function extractBlock(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[0] ?? '';
}

function extractInlineScript(html: string): string {
  return extractBlock(html, /<script type="module">[\s\S]*?<\/script>/);
}

function extractElementSubtree(html: string, openingTag: string): string {
  const startIndex = html.indexOf(openingTag);
  if (startIndex === -1) return '';
  const tagOpenRegex = /<div\b[^>]*>/g;
  const tagCloseRegex = /<\/div>/g;
  tagOpenRegex.lastIndex = startIndex;
  const firstOpen = tagOpenRegex.exec(html);
  if (firstOpen === null || firstOpen.index !== startIndex) return '';
  let depth = 1;
  let cursor = startIndex + firstOpen[0].length;
  while (depth > 0) {
    tagOpenRegex.lastIndex = cursor;
    tagCloseRegex.lastIndex = cursor;
    const nextOpen = tagOpenRegex.exec(html);
    const nextClose = tagCloseRegex.exec(html);
    if (nextClose === null) return '';
    if (nextOpen !== null && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
    }
  }
  return html.substring(startIndex, cursor);
}

describe('SPEC-230 — dashboard shell layout', () => {
  let indexHtml: string;
  let headerBlock: string;
  let inlineScript: string;

  beforeEach(() => {
    indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
    headerBlock = extractBlock(indexHtml, /<header class="topbar">[\s\S]*?<\/header>/);
    inlineScript = extractInlineScript(indexHtml);
  });

  describe('header', () => {
    it('holds the view navigation, the single status pill and the capacity badge', () => {
      expect(headerBlock).toMatch(/id="view-nav"/);
      expect(headerBlock).toMatch(/id="health-pill"/);
      expect(headerBlock).toMatch(/id="header-capacity-badge-slot"/);
    });

    it('keeps logs, Claude costs and settings one click away', () => {
      expect(headerBlock).toMatch(/id="toggle-logs-btn"[^>]*onclick="toggleLogs\(\)"/);
      expect(headerBlock).toMatch(
        /id="open-economics-sheet-btn"[^>]*onclick="openEconomicsSheet\(\)"/,
      );
      expect(headerBlock).toMatch(/id="open-settings-modal-btn"/);
    });

    it('gathers the project tabs and project management in the project switcher', () => {
      const switcher = extractElementSubtree(indexHtml, '<div id="project-switcher-panel"');
      expect(switcher).toMatch(/id="dashboard-tabs"/);
      expect(switcher).toMatch(/id="manage-projects-toggle"/);
      expect(switcher).toMatch(/id="manage-panel"/);
    });

    it('no longer shows model, trigger and timeout controls, nor separate status badges', () => {
      expect(indexHtml).not.toMatch(/id="model-select"/);
      expect(indexHtml).not.toMatch(/id="trigger-mode-select"/);
      expect(indexHtml).not.toMatch(/id="review-timeout-input"/);
      expect(indexHtml).not.toMatch(/id="claude-status"/);
      expect(indexHtml).not.toMatch(/id="git-cli-status"/);
      expect(indexHtml).not.toMatch(/id="server-status"/);
    });
  });

  describe('views', () => {
    it('declares the review queue, team and worktrees views', () => {
      expect(indexHtml).toMatch(/id="view-queue"[^>]*data-view="queue"/);
      expect(indexHtml).toMatch(/id="view-team"[^>]*data-view="team"/);
      expect(indexHtml).toMatch(/id="view-worktrees"[^>]*data-view="worktrees"/);
    });

    it('keeps the live reviews, pending confirmations, size blocks and overview in the queue view', () => {
      const queueView = extractElementSubtree(indexHtml, '<div id="view-queue"');
      for (const id of [
        'live-reviews',
        'pending-reviews-section',
        'size-block-section',
        'overview-section',
        'review-queue',
        'completed-reviews-section',
      ]) {
        expect(queueView).toMatch(new RegExp(`id="${id}"`));
      }
    });

    it('moves the team insights to the team view and the worktree pool and cleanup to the worktrees view', () => {
      expect(extractElementSubtree(indexHtml, '<div id="view-team"')).toMatch(
        /id="team-tab-content"/,
      );
      const worktreesView = extractElementSubtree(indexHtml, '<div id="view-worktrees"');
      expect(worktreesView).toMatch(/id="worktree-section"/);
      expect(worktreesView).toMatch(/id="cleanup-content"/);
    });

    it('drops the three rows of counters: the queue tabs are the only counters left', () => {
      expect(indexHtml).not.toMatch(/class="focus-strip/);
      expect(indexHtml).not.toMatch(/id="running-count"/);
      expect(indexHtml).not.toMatch(/id="cards-scope-marker"/);
    });

    it('keeps the stats page link in the team view, disabled until a project is open', () => {
      const button = indexHtml.match(/<button[^>]*id="open-stats-sheet-btn"[^>]*>/)?.[0] ?? '';
      expect(button).toMatch(/onclick="openStatsSheet\(\)"/);
      expect(button).toMatch(/\bdisabled\b/);
      expect(inlineScript).toMatch(/\/stats\?path=\$\{encodeURIComponent\(currentProjectPath\)\}/);
    });
  });

  describe('side panel', () => {
    it('offers the pull request detail and Ember side by side', () => {
      const panel = extractBlock(indexHtml, /<aside class="card side-panel"[\s\S]*?<\/aside>/);
      expect(panel).toMatch(/id="panel-tabs"/);
      expect(panel).toMatch(/id="panel-pr"/);
      expect(panel).toMatch(/id="ember-chat-panel"/);
      expect(panel).toMatch(/id="ember-context"/);
    });
  });

  describe('economics sheet markup', () => {
    it('preserves the inner DOM ids needed by existing fetchers and renderers', () => {
      const sheetBlock = extractElementSubtree(indexHtml, '<div id="economics-sheet"');
      for (const id of [
        'token-usage-content',
        'budget-tile',
        'budget-slider',
        'budget-slider-value',
        'budget-slider-submit',
        'budget-slider-status',
      ]) {
        expect(sheetBlock).toMatch(new RegExp(`id="${id}"`));
      }
      expect(indexHtml).toMatch(
        /id="economics-sheet-overlay"[^>]*onclick="closeEconomicsSheet\(\)"/,
      );
    });
  });

  describe('script wiring', () => {
    it('renders the shell through the dedicated modules', () => {
      for (const module of [
        'reviewQueue',
        'reviewQueueView',
        'prDetailPanel',
        'liveReviews',
        'healthPill',
        'viewNavigation',
      ]) {
        expect(inlineScript).toMatch(new RegExp(`from\\s+['"]\\./modules/${module}\\.js['"]`));
      }
    });

    it('closes every drawer and popover on Escape', () => {
      const escapeHandler =
        inlineScript.match(/addEventListener\('keydown'[\s\S]*?\n    \}\);/)?.[0] ?? '';
      expect(escapeHandler).toMatch(/closeMrSheet\(\)/);
      expect(escapeHandler).toMatch(/closeDevSheet\(\)/);
      expect(escapeHandler).toMatch(/closeEconomicsSheet\(\)/);
      expect(escapeHandler).toMatch(/closePopovers\(\)/);
    });

    it('still hides the pending reviews section when nothing waits', () => {
      expect(inlineScript).toMatch(/shouldHidePendingReviewsSection\(/);
    });

    it('carries no "//" label prefix in the markup', () => {
      const markup = indexHtml.slice(0, indexHtml.indexOf('<script type="module">'));
      expect(markup).not.toMatch(/>\s*\/\/ [A-Z]/);
    });
  });
});
