import { describe, it, expect } from 'vitest';

import {
  getAgentsForPreset,
  getFullAgentCatalog,
} from '@/modules/setup-wizard/services/agentPresetCatalog.js';

describe('agentPresetCatalog', () => {
  it('returns specific agents for the backend preset', () => {
    const agents = getAgentsForPreset('backend');
    expect(agents).toContain('architecture');
    expect(agents).toContain('solid');
    expect(agents).toContain('testing');
  });

  it('returns react-best-practices in the frontend preset', () => {
    expect(getAgentsForPreset('frontend')).toContain('react-best-practices');
  });

  it('returns an empty list for the basic preset', () => {
    expect(getAgentsForPreset('basic')).toEqual([]);
  });

  it('returns an empty list for the custom preset (user picks manually)', () => {
    expect(getAgentsForPreset('custom')).toEqual([]);
  });

  it('returns a deduplicated agent catalog', () => {
    const catalog = getFullAgentCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(new Set(catalog).size).toBe(catalog.length);
  });

  it('returns a defensive copy that callers can mutate without affecting the source', () => {
    const a = getFullAgentCatalog();
    a.push('mutation');
    const b = getFullAgentCatalog();
    expect(b).not.toContain('mutation');
  });
});
