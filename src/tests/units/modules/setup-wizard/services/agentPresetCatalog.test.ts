import { describe, it, expect } from 'vitest';

import {
  getAgentsForPreset,
  getFullAgentCatalog,
  buildCustomAgents,
} from '@/modules/setup-wizard/services/agentPresetCatalog.js';

function names(agents: { name: string }[]): string[] {
  return agents.map((agent) => agent.name);
}

describe('agentPresetCatalog', () => {
  it('returns specific agents for the backend preset, including pipeline stages', () => {
    const agents = names(getAgentsForPreset('backend'));
    expect(agents).toContain('clean-architecture');
    expect(agents).toContain('solid');
    expect(agents).toContain('testing');
    expect(agents).toContain('threads');
    expect(agents).toContain('report');
  });

  it('returns react-best-practices in the frontend preset', () => {
    expect(names(getAgentsForPreset('frontend'))).toContain('react-best-practices');
  });

  it('returns an empty list for the basic preset', () => {
    expect(getAgentsForPreset('basic')).toEqual([]);
  });

  it('returns an empty list for the custom preset (user picks manually)', () => {
    expect(getAgentsForPreset('custom')).toEqual([]);
  });

  it('returns a deduplicated agent catalog, excluding pipeline-internal stages', () => {
    const catalog = getFullAgentCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(new Set(names(catalog)).size).toBe(catalog.length);
    expect(names(catalog)).not.toContain('threads');
    expect(names(catalog)).not.toContain('report');
  });

  it('returns a defensive copy that callers can mutate without affecting the source', () => {
    const a = getFullAgentCatalog();
    a.push({ name: 'mutation', displayName: 'Mutation' });
    const b = getFullAgentCatalog();
    expect(names(b)).not.toContain('mutation');
  });

  it('resolves selected catalog names to agent definitions and appends pipeline stages', () => {
    const agents = buildCustomAgents(['solid', 'security']);
    expect(names(agents)).toEqual(
      expect.arrayContaining(['solid', 'security', 'threads', 'report']),
    );
  });

  it('ignores unknown agent names and de-duplicates the result', () => {
    const agents = buildCustomAgents(['solid', 'solid', 'not-a-real-agent']);
    expect(names(agents)).toEqual(['solid', 'threads', 'report']);
  });
});
