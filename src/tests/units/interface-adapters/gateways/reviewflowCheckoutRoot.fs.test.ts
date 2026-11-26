import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { findReviewflowCheckoutRoot } from '@/modules/cli-configuration/interface-adapters/gateways/reviewflowCheckoutRoot.fs.js';

function writePackageManifest(directory: string, content: string): void {
  writeFileSync(join(directory, 'package.json'), content);
}

describe('findReviewflowCheckoutRoot', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'reviewflow-checkout-root-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns the reviewflow checkout directory that contains the start path', () => {
    const checkoutRoot = join(tempRoot, 'review-flow');
    mkdirSync(join(checkoutRoot, '.git'), { recursive: true });
    writePackageManifest(checkoutRoot, JSON.stringify({ name: 'reviewflow' }));
    const startPath = join(checkoutRoot, 'dist', 'modules');
    mkdirSync(startPath, { recursive: true });

    expect(findReviewflowCheckoutRoot(startPath)).toBe(checkoutRoot);
  });

  it('skips a foreign git repository and returns null when no reviewflow checkout encloses the start path', () => {
    mkdirSync(join(tempRoot, '.git'));
    writePackageManifest(tempRoot, JSON.stringify({ name: 'nvm' }));
    const startPath = join(tempRoot, 'lib', 'node_modules', 'reviewflow', 'dist');
    mkdirSync(startPath, { recursive: true });

    expect(findReviewflowCheckoutRoot(startPath)).toBeNull();
  });

  it('returns null when the package manifest next to .git is not valid JSON', () => {
    mkdirSync(join(tempRoot, '.git'));
    writePackageManifest(tempRoot, '{ not json');

    expect(findReviewflowCheckoutRoot(tempRoot)).toBeNull();
  });
});
