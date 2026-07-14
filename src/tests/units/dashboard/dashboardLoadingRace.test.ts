/**
 * Regression test for issue #339 — Priority Lanes and Completed Reviews stuck
 * on "Loading..." forever.
 *
 * Structural assertions on src/dashboard/index.html via raw-string + regex,
 * matching the precedent of dashboardLayout.test.ts (no jsdom dependency).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const INDEX_HTML_PATH = join(PROJECT_ROOT, 'src', 'dashboard', 'index.html');

function extractFunctionBody(source: string, functionName: string): string {
  const signatureIndex = source.indexOf(`function ${functionName}(`);
  if (signatureIndex === -1) return '';
  const firstBraceIndex = source.indexOf('{', signatureIndex);
  if (firstBraceIndex === -1) return '';
  let depth = 1;
  let cursor = firstBraceIndex + 1;
  while (depth > 0 && cursor < source.length) {
    const char = source[cursor];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    cursor += 1;
  }
  return source.substring(signatureIndex, cursor);
}

describe('Issue #339 — dashboard loading state race', () => {
  let indexHtml: string;

  beforeAll(() => {
    indexHtml = readFileSync(INDEX_HTML_PATH, 'utf-8');
  });

  it('fetchMrTracking renders after clearing the mrTracking loading flag, not before', () => {
    const functionBody = extractFunctionBody(indexHtml, 'fetchMrTracking');
    expect(functionBody).not.toBe('');

    const clearFlagIndex = functionBody.lastIndexOf("setLoadingFlag('mrTracking', false)");
    const renderCallIndex = functionBody.lastIndexOf('updateMrTrackingUI()');

    expect(clearFlagIndex).toBeGreaterThan(-1);
    expect(renderCallIndex).toBeGreaterThan(-1);
    expect(renderCallIndex).toBeGreaterThan(clearFlagIndex);
  });

  it('fetchReviewFiles renders after clearing the reviewFiles loading flag, not before', () => {
    const functionBody = extractFunctionBody(indexHtml, 'fetchReviewFiles');
    expect(functionBody).not.toBe('');

    const clearFlagIndex = functionBody.indexOf("setLoadingFlag('reviewFiles', false)");
    const renderCallIndex = functionBody.lastIndexOf('updateReviewFilesUI()');

    expect(clearFlagIndex).toBeGreaterThan(-1);
    expect(renderCallIndex).toBeGreaterThan(-1);
    expect(renderCallIndex).toBeGreaterThan(clearFlagIndex);
  });
});
