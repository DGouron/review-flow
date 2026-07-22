import { describe, it, expect } from 'vitest';

import {
  PRINCIPLE_CATALOG,
  CATALOG_ORDER,
  isCatalogPrinciple,
  catalogAgentDefinition,
  detectDeclaredPrinciples,
} from '@/modules/review-execution/entities/progress/principleCatalog.type.js';

describe('PRINCIPLE_CATALOG', () => {
  it('maps every catalog principle to a display name reused from the default agents', () => {
    expect(PRINCIPLE_CATALOG['clean-architecture'].displayName).toBe('Clean Archi');
    expect(PRINCIPLE_CATALOG.ddd.displayName).toBe('DDD');
    expect(PRINCIPLE_CATALOG.solid.displayName).toBe('SOLID');
    expect(PRINCIPLE_CATALOG['clean-code'].displayName).toBe('Clean Code');
    expect(PRINCIPLE_CATALOG['react-best-practices'].displayName).toBe('React');
    expect(PRINCIPLE_CATALOG.testing.displayName).toBe('Testing');
    expect(PRINCIPLE_CATALOG.security.displayName).toBe('Security');
    expect(PRINCIPLE_CATALOG.performance.displayName).toBe('Performance');
    expect(PRINCIPLE_CATALOG['code-quality'].displayName).toBe('Code Quality');
  });
});

describe('CATALOG_ORDER', () => {
  it('lists every catalog principle exactly once', () => {
    const catalogKeys = Object.keys(PRINCIPLE_CATALOG);
    expect([...CATALOG_ORDER].sort()).toEqual([...catalogKeys].sort());
  });

  it('orders clean-architecture before ddd and solid before testing', () => {
    expect(CATALOG_ORDER.indexOf('clean-architecture')).toBeLessThan(CATALOG_ORDER.indexOf('ddd'));
    expect(CATALOG_ORDER.indexOf('solid')).toBeLessThan(CATALOG_ORDER.indexOf('testing'));
  });
});

describe('isCatalogPrinciple', () => {
  it('accepts a catalog name', () => {
    expect(isCatalogPrinciple('solid')).toBe(true);
  });

  it('rejects a name outside the catalog', () => {
    expect(isCatalogPrinciple('made-up-principle')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isCatalogPrinciple(42)).toBe(false);
  });
});

describe('catalogAgentDefinition', () => {
  it('builds an agent definition from the catalog display name', () => {
    expect(catalogAgentDefinition('clean-architecture')).toEqual({
      name: 'clean-architecture',
      displayName: 'Clean Archi',
    });
  });
});

describe('detectDeclaredPrinciples', () => {
  it('returns an empty list when nothing is declared', () => {
    expect(detectDeclaredPrinciples({ claudeMd: null, skillDirectoryNames: [] })).toEqual([]);
  });

  it('detects principles from skill directory names, case-insensitively', () => {
    expect(
      detectDeclaredPrinciples({
        claudeMd: null,
        skillDirectoryNames: ['Clean-Architecture', 'ddd'],
      }),
    ).toEqual(['clean-architecture', 'ddd']);
  });

  it('detects principles from CLAUDE.md keywords, case-insensitively', () => {
    expect(
      detectDeclaredPrinciples({
        claudeMd: 'We follow SOLID and value Testing (TDD).',
        skillDirectoryNames: [],
      }),
    ).toEqual(['solid', 'testing']);
  });

  it('returns results in catalog order and de-duplicated across sources', () => {
    expect(
      detectDeclaredPrinciples({
        claudeMd: 'testing and clean architecture matter',
        skillDirectoryNames: ['solid', 'clean-architecture'],
      }),
    ).toEqual(['clean-architecture', 'solid', 'testing']);
  });

  it('does not match a directory name outside the catalog', () => {
    expect(
      detectDeclaredPrinciples({ claudeMd: null, skillDirectoryNames: ['made-up-principle'] }),
    ).toEqual([]);
  });
});
