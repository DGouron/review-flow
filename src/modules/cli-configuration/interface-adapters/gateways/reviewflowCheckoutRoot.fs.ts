import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REVIEWFLOW_PACKAGE_NAME = 'reviewflow';

function declaresReviewflowPackage(directory: string): boolean {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf-8'));
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      'name' in manifest &&
      manifest.name === REVIEWFLOW_PACKAGE_NAME
    );
  } catch {
    return false;
  }
}

function isReviewflowCheckout(directory: string): boolean {
  return existsSync(join(directory, '.git')) && declaresReviewflowPackage(directory);
}

function findClosestAncestor(
  startPath: string,
  matches: (directory: string) => boolean,
): string | null {
  let current = startPath;
  while (true) {
    if (matches(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Walks up from `startPath` to the reviewflow git checkout that contains it.
 * A `.git` belonging to another project (nvm, Homebrew) is not a reviewflow checkout.
 */
export function findReviewflowCheckoutRoot(startPath: string): string | null {
  return findClosestAncestor(startPath, isReviewflowCheckout);
}

/**
 * Walks up from `startPath` to the reviewflow package that contains it, checkout or npm install.
 */
export function findReviewflowPackageRoot(startPath: string): string | null {
  return findClosestAncestor(startPath, declaresReviewflowPackage);
}
