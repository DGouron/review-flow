/**
 * Issue #366 — inline `onchange` / `onclick` attributes resolve identifiers in
 * GLOBAL scope, but the dashboard script is `type="module"`, so every handler
 * referenced from an inline attribute must be assigned onto `window`.
 *
 * Structural assertion on src/dashboard/index.html via raw-string + regex,
 * matching the precedent of dashboardLayout.test.ts.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');

function readIndexHtml(): string {
  return readFileSync(INDEX_HTML_PATH, 'utf-8');
}

function collectInlineHandlerNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/\son(?:change|click|input|submit)="([a-zA-Z_$][\w$]*)\(/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names].sort();
}

function collectWindowExports(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/window\.([a-zA-Z_$][\w$]*)\s*=/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names].sort();
}

describe('dashboard inline handler exports', () => {
  it('exposes changeTriggerMode on window so the trigger mode chip works', () => {
    expect(collectWindowExports(readIndexHtml())).toContain('changeTriggerMode');
  });

  it('exposes every function referenced by an inline handler attribute', () => {
    const html = readIndexHtml();
    const exported = new Set(collectWindowExports(html));
    const missing = collectInlineHandlerNames(html).filter((name) => !exported.has(name));

    expect(missing).toEqual([]);
  });
});
