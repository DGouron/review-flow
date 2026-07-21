import { describe, it, expect } from 'vitest';

import {
  DEFAULT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FRONT_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { ResolveAuditScopeUseCase } from '@/modules/review-execution/usecases/resolveAuditScope.usecase.js';

const emptySignals = { claudeMd: null, skillDirectoryNames: [] };

function names(agents: { name: string }[]): string[] {
  return agents.map((agent) => agent.name);
}

function principlesOf(agents: { name: string }[]): string[] {
  return names(agents).filter((name) => name !== 'threads' && name !== 'report');
}

describe('ResolveAuditScopeUseCase', () => {
  const useCase = new ResolveAuditScopeUseCase();

  it('uses explicit audits verbatim as catalog agent definitions', () => {
    const scope = useCase.execute({
      audits: ['solid', 'testing'],
      agents: null,
      focus: null,
      signals: emptySignals,
    });

    expect(scope).toEqual([
      { name: 'solid', displayName: 'SOLID' },
      { name: 'testing', displayName: 'Testing' },
    ]);
  });

  it('filters non-catalog audit entries defensively', () => {
    const scope = useCase.execute({
      audits: ['solid', 'made-up-principle'],
      agents: null,
      focus: null,
      signals: emptySignals,
    });

    expect(names(scope)).toEqual(['solid']);
  });

  it('keeps agents principle entries, dropping threads and report', () => {
    const scope = useCase.execute({
      audits: null,
      agents: [
        { name: 'solid', displayName: 'SOLID' },
        { name: 'threads', displayName: 'Threads' },
        { name: 'report', displayName: 'Rapport' },
      ],
      focus: null,
      signals: emptySignals,
    });

    expect(names(scope)).toEqual(['solid']);
  });

  it('auto-detects principles from signals when no config is present', () => {
    const scope = useCase.execute({
      audits: null,
      agents: null,
      focus: 'back',
      signals: { claudeMd: 'We apply SOLID and testing.', skillDirectoryNames: [] },
    });

    expect(names(scope)).toEqual(['solid', 'testing']);
  });

  it('falls through to focus defaults when auto-detection is empty', () => {
    const scope = useCase.execute({
      audits: null,
      agents: null,
      focus: 'front',
      signals: emptySignals,
    });

    expect(names(scope)).toEqual(principlesOf(DEFAULT_FRONT_AGENTS));
  });

  it('falls back to DEFAULT_AGENTS principles when focus is null (unchanged behavior)', () => {
    const scope = useCase.execute({
      audits: null,
      agents: null,
      focus: null,
      signals: emptySignals,
    });

    expect(names(scope)).toEqual(principlesOf(DEFAULT_AGENTS));
  });

  it('falls back to focus defaults when config has empty agents and no detection', () => {
    const scope = useCase.execute({
      audits: null,
      agents: null,
      focus: 'back',
      signals: emptySignals,
    });

    expect(names(scope)).toEqual(principlesOf(DEFAULT_BACK_AGENTS));
  });

  it('never returns a scope containing meta steps', () => {
    const scope = useCase.execute({
      audits: null,
      agents: null,
      focus: 'back',
      signals: emptySignals,
    });

    expect(names(scope)).not.toContain('threads');
    expect(names(scope)).not.toContain('report');
  });
});
