import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const MODULES_DIR = resolve(process.cwd(), 'src/dashboard/modules');

const TESTS_DIR = resolve(process.cwd(), 'src/tests/units/dashboard/modules');

function listJsModules(): string[] {
  if (!existsSync(MODULES_DIR)) {
    return [];
  }
  return readdirSync(MODULES_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.replace(/\.js$/, ''));
}

function listTestFiles(): string[] {
  if (!existsSync(TESTS_DIR)) {
    return [];
  }
  return readdirSync(TESTS_DIR)
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => file.replace(/\.test\.ts$/, ''));
}

describe('Acceptance — Spec #51: dashboard modules coverage', () => {
  // Outer-loop SDD acceptance test. The 6 previously uncovered modules
  // (cleanup, collapsibleList, mrSheet, sharedViewHelpers, statsCharts,
  // versionUpdate) now have smoke tests, so this acceptance turns GREEN.
  it('every dashboard module has a corresponding test file', () => {
    const modules = listJsModules();
    const tests = listTestFiles();

    expect(modules.length).toBeGreaterThan(0);

    const uncovered = modules.filter((module) => !tests.includes(module));

    expect(uncovered, `Modules sans test: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every test file targets an existing dashboard module', () => {
    const modules = listJsModules();
    const tests = listTestFiles();

    const orphans = tests.filter((test) => !modules.includes(test));

    expect(orphans, `Tests orphelins: ${orphans.join(', ')}`).toEqual([]);
  });

  it('dashboard modules directory exists', () => {
    expect(existsSync(MODULES_DIR), 'Aucun module dashboard détecté').toBe(true);
  });
});
