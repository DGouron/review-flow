/**
 * SPEC-181 — Dashboard Empty-State Restructure & Team-First Layout
 *
 * SDD outer-loop test (per orchestrator instruction — UI-only spec, the
 * dashboard test convention keeps acceptance inside src/tests/units/dashboard/).
 * Structural assertions on src/dashboard/index.html via raw-string + regex,
 * matching the precedent of SPEC-178 acceptance test. No jsdom dependency
 * required (anti-overengineering — same fidelity as SPEC-178).
 *
 * Source of truth: docs/specs/181-dashboard-empty-state-restructure.md.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');

function extractMainBlock(html: string): string {
  const match = html.match(/<main class="dashboard-main">[\s\S]*?<\/main>/);
  return match?.[0] ?? '';
}

function extractSidebarBlock(html: string): string {
  const match = html.match(/<aside class="dashboard-sidebar"[\s\S]*?<\/aside>/);
  return match?.[0] ?? '';
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script type="module">[\s\S]*?<\/script>/);
  return match?.[0] ?? '';
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

function extractTopLevelChildIds(mainBlock: string): string[] {
  const childRegex = /^\s{8}<(div|section|main|aside|nav|button|footer|header|article)\b([^>]*)>/gm;
  const ids: string[] = [];
  let result: RegExpExecArray | null = childRegex.exec(mainBlock);
  while (result !== null) {
    const attributes = result[2] ?? '';
    const idMatch = attributes.match(/id="([^"]+)"/);
    const classMatch = attributes.match(/class="([^"]+)"/);
    if (idMatch) {
      ids.push(`#${idMatch[1]}`);
    } else if (classMatch) {
      ids.push(`.${classMatch[1].split(/\s+/)[0]}`);
    } else {
      ids.push('?');
    }
    result = childRegex.exec(mainBlock);
  }
  return ids;
}

describe('SPEC-181 — Dashboard Empty-State Restructure & Team-First Layout', () => {
  let indexHtml: string;
  let mainBlock: string;
  let sidebarBlock: string;
  let inlineScript: string;

  beforeEach(() => {
    indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
    mainBlock = extractMainBlock(indexHtml);
    sidebarBlock = extractSidebarBlock(indexHtml);
    inlineScript = extractInlineScript(indexHtml);
  });

  describe('main DOM order', () => {
    it('team-section is the first top-level child of <main class="dashboard-main">', () => {
      const childIds = extractTopLevelChildIds(mainBlock);
      expect(childIds[0]).toBe('#team-section');
    });

    it('focus-strip is the second top-level child of <main class="dashboard-main">', () => {
      const childIds = extractTopLevelChildIds(mainBlock);
      expect(childIds[1]).toBe('.focus-strip');
    });

    it('matches the expected top-level child order inside <main>', () => {
      const childIds = extractTopLevelChildIds(mainBlock);
      expect(childIds).toEqual([
        '#team-section',
        '.focus-strip',
        '#size-block-section',
        '#overview-section',
        '#data-loading-state',
        '#config-info',
        '#claude-login-section',
        '#git-login-section',
        '#pending-reviews-section',
        '#logs-section',
        '#active-reviews-section',
        '#active-followups-section',
        '#pending-fix-section',
        '#pending-approval-section',
        '#completed-reviews-section',
        '#cleanup-section',
        '.refresh-info',
      ]);
    });

    it('does NOT contain #claude-economics-section inside <main>', () => {
      expect(mainBlock).not.toMatch(/id="claude-economics-section"/);
    });

    it('does NOT contain #stats-section inside <main>', () => {
      expect(mainBlock).not.toMatch(/id="stats-section"/);
    });
  });

  describe('sidebar buttons', () => {
    it('#open-economics-sheet-btn exists inside <aside class="dashboard-sidebar">', () => {
      expect(sidebarBlock).toMatch(/id="open-economics-sheet-btn"/);
    });

    it('#open-economics-sheet-btn has no `hidden` attribute (always visible)', () => {
      const buttonMatch = sidebarBlock.match(/<button[^>]*id="open-economics-sheet-btn"[^>]*>/);
      expect(buttonMatch).not.toBeNull();
      expect(buttonMatch?.[0]).not.toMatch(/\bhidden\b/);
    });

    it('#open-stats-sheet-btn exists inside <aside class="dashboard-sidebar">', () => {
      expect(sidebarBlock).toMatch(/id="open-stats-sheet-btn"/);
    });

    it('#open-stats-sheet-btn is initially disabled and aria-disabled', () => {
      const buttonMatch = sidebarBlock.match(/<button[^>]*id="open-stats-sheet-btn"[^>]*>/);
      expect(buttonMatch).not.toBeNull();
      expect(buttonMatch?.[0]).toMatch(/\bdisabled\b/);
      expect(buttonMatch?.[0]).toMatch(/aria-disabled="true"/);
    });
  });

  describe('economics sheet markup', () => {
    it('declares #economics-sheet-overlay, #economics-sheet, #economics-sheet-content', () => {
      expect(indexHtml).toMatch(/id="economics-sheet-overlay"/);
      expect(indexHtml).toMatch(/id="economics-sheet"/);
      expect(indexHtml).toMatch(/id="economics-sheet-content"/);
    });

    it('preserves inner DOM ids needed by existing fetchers/renderers', () => {
      const sheetBlock = extractElementSubtree(indexHtml, '<div id="economics-sheet"');
      expect(sheetBlock).not.toBe('');
      expect(sheetBlock).toMatch(/id="token-usage-content"/);
      expect(sheetBlock).toMatch(/id="budget-tile"/);
      expect(sheetBlock).toMatch(/id="budget-slider"/);
      expect(sheetBlock).toMatch(/id="budget-slider-value"/);
      expect(sheetBlock).toMatch(/id="budget-slider-submit"/);
      expect(sheetBlock).toMatch(/id="budget-slider-status"/);
    });

    it('wires open and close handlers via onclick attributes', () => {
      expect(indexHtml).toMatch(
        /id="open-economics-sheet-btn"[^>]*onclick="openEconomicsSheet\(\)"/,
      );
      expect(indexHtml).toMatch(
        /id="economics-sheet-overlay"[^>]*onclick="closeEconomicsSheet\(\)"/,
      );
    });

    it('contains a sheet-close button inside the economics sheet', () => {
      const sheetBlock = extractElementSubtree(indexHtml, '<div id="economics-sheet"');
      expect(sheetBlock).toMatch(/class="sheet-close"/);
    });
  });

  describe('stats moved to dedicated /stats page (sheet removed)', () => {
    it('no longer declares the stats sheet markup', () => {
      expect(indexHtml).not.toMatch(/id="stats-sheet-overlay"/);
      expect(indexHtml).not.toMatch(/id="stats-sheet"/);
      expect(indexHtml).not.toMatch(/id="project-stats"/);
    });

    it('the stats sidebar button navigates to the dedicated /stats page', () => {
      expect(indexHtml).toMatch(/id="open-stats-sheet-btn"[^>]*onclick="openStatsSheet\(\)"/);
      expect(indexHtml).toMatch(/\/stats\?path=\$\{encodeURIComponent\(currentProjectPath\)\}/);
    });

    it('no longer defines the removed sheet handlers', () => {
      expect(indexHtml).not.toMatch(/function closeStatsSheet/);
      expect(indexHtml).not.toMatch(/function filterScoreTrend/);
      expect(indexHtml).not.toMatch(/async function recalculateStats/);
    });
  });

  describe('removed empty-state markup', () => {
    it('#pending-reviews-section is still present but #pending-reviews-empty-state is gone', () => {
      expect(mainBlock).toMatch(/id="pending-reviews-section"/);
      expect(mainBlock).not.toMatch(/id="pending-reviews-empty-state"/);
    });

    it('#active-reviews-section is still present but #i18n-empty-active-reviews placeholder div is gone', () => {
      expect(mainBlock).toMatch(/id="active-reviews-section"/);
      const activeReviewsMatch = mainBlock.match(
        /<div[^>]*id="active-reviews-section"[\s\S]*?<\/div>\s*<\/div>/,
      );
      expect(activeReviewsMatch).not.toBeNull();
      const activeReviewsBlock = activeReviewsMatch?.[0] ?? '';
      expect(activeReviewsBlock).not.toMatch(
        /<div[^>]*id="i18n-empty-active-reviews"[^>]*>\s*<\/div>/,
      );
    });
  });

  describe('script wiring', () => {
    it('imports the sectionVisibility helper module', () => {
      expect(inlineScript).toMatch(/from\s+['"]\.\/modules\/sectionVisibility\.js['"]/);
    });

    it('invokes shouldHidePendingReviewsSection and shouldHideActiveReviewsSection in the script body', () => {
      expect(inlineScript).toMatch(/shouldHidePendingReviewsSection\(/);
      expect(inlineScript).toMatch(/shouldHideActiveReviewsSection\(/);
    });

    it('drops the dead-code reference to claude-economics-section from secondarySections', () => {
      const secondaryMatch = inlineScript.match(/const secondarySections\s*=\s*\[[^\]]*\];/);
      expect(secondaryMatch).not.toBeNull();
      expect(secondaryMatch?.[0]).not.toMatch(/'claude-economics-section'/);
    });

    it('no longer declares or exposes toggleStats', () => {
      expect(inlineScript).not.toMatch(/function toggleStats\b/);
      expect(inlineScript).not.toMatch(/window\.toggleStats\s*=/);
    });

    it('no longer references removed empty-state translation lookup ids', () => {
      expect(inlineScript).not.toMatch(/getElementById\(['"]i18n-empty-active-reviews['"]\)/);
      expect(inlineScript).not.toMatch(/getElementById\(['"]i18n-empty-pending-reviews['"]\)/);
    });
  });

  describe('i18n orphan keys', () => {
    let i18nSource: string;

    beforeEach(() => {
      const I18N_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'modules', 'i18n.js');
      i18nSource = readFileSync(I18N_PATH, 'utf-8');
    });

    it('drops empty.activeReviews translation key in both locales', () => {
      expect(i18nSource).not.toMatch(/['"]empty\.activeReviews['"]\s*:/);
    });

    it('drops empty.pendingReviews translation key in both locales', () => {
      expect(i18nSource).not.toMatch(/['"]empty\.pendingReviews['"]\s*:/);
    });
  });
});
