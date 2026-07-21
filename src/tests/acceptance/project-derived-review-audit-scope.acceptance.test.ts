import { describe, it, expect } from 'vitest';

import { parseProjectConfig } from '@/config/projectConfig.js';
import { buildAuditScopeDirective } from '@/frameworks/claude/auditScopeDirective.js';
import {
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  withMetaSteps,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { ResolveAuditScopeUseCase } from '@/modules/review-execution/usecases/resolveAuditScope.usecase.js';
import { StubProjectPrinciplesGateway } from '@/tests/stubs/projectPrinciples.stub.js';

function names(agents: { name: string }[]): string[] {
  return agents.map((agent) => agent.name);
}

function principlesOf(agents: { name: string }[]): string[] {
  return names(agents).filter((name) => name !== 'threads' && name !== 'report');
}

describe('Project-derived review audit scope (acceptance)', () => {
  const resolveAuditScope = new ResolveAuditScopeUseCase();

  describe('scope resolution precedence', () => {
    it('explicit audits win: config.audits drives the scope verbatim', () => {
      const gateway = new StubProjectPrinciplesGateway();
      const signals = gateway.readSignals('/project');

      const scope = resolveAuditScope.execute({
        audits: ['solid', 'testing'],
        agents: null,
        focus: null,
        signals,
      });

      expect(principlesOf(scope)).toEqual(['solid', 'testing']);
      expect(names(withMetaSteps(scope))).toEqual(['solid', 'testing', 'threads', 'report']);
      const directive = buildAuditScopeDirective(scope);
      expect(directive).toContain('solid');
      expect(directive).toContain('testing');
    });

    it('agents fallback: principle entries of the agents array become the scope', () => {
      const gateway = new StubProjectPrinciplesGateway();
      const scope = resolveAuditScope.execute({
        audits: null,
        agents: [
          { name: 'solid', displayName: 'SOLID' },
          { name: 'threads', displayName: 'Threads' },
          { name: 'report', displayName: 'Rapport' },
        ],
        focus: null,
        signals: gateway.readSignals('/project'),
      });

      expect(principlesOf(scope)).toEqual(['solid']);
    });

    it('autodetect from CLAUDE.md: mentions map to catalog principles, unmentioned are excluded', () => {
      const gateway = new StubProjectPrinciplesGateway();
      gateway.setSignals('/project', {
        claudeMd: 'This project applies SOLID principles and testing (TDD).',
        skillDirectoryNames: [],
      });

      const scope = resolveAuditScope.execute({
        audits: null,
        agents: null,
        focus: 'back',
        signals: gateway.readSignals('/project'),
      });

      expect(principlesOf(scope)).toEqual(['solid', 'testing']);
      expect(names(scope)).not.toContain('clean-architecture');
    });

    it('autodetect from skills directory names', () => {
      const gateway = new StubProjectPrinciplesGateway();
      gateway.setSignals('/project', {
        claudeMd: null,
        skillDirectoryNames: ['clean-architecture', 'ddd'],
      });

      const scope = resolveAuditScope.execute({
        audits: null,
        agents: null,
        focus: null,
        signals: gateway.readSignals('/project'),
      });

      expect(principlesOf(scope)).toEqual(['clean-architecture', 'ddd']);
    });

    it('autodetect empty falls through to focus defaults', () => {
      const gateway = new StubProjectPrinciplesGateway();
      gateway.setSignals('/project', {
        claudeMd: 'Nothing matching the catalog here.',
        skillDirectoryNames: [],
      });

      const scope = resolveAuditScope.execute({
        audits: null,
        agents: null,
        focus: 'front',
        signals: gateway.readSignals('/project'),
      });

      expect(principlesOf(scope)).toEqual(principlesOf(DEFAULT_FRONT_AGENTS));
    });

    it('no config at all falls back to focus defaults (unchanged behavior)', () => {
      const gateway = new StubProjectPrinciplesGateway();
      const scope = resolveAuditScope.execute({
        audits: null,
        agents: null,
        focus: 'back',
        signals: gateway.readSignals('/project'),
      });

      expect(principlesOf(scope)).toEqual(principlesOf(DEFAULT_BACK_AGENTS));
    });

    it('meta steps threads/report are always present even for a single-principle scope', () => {
      const scope = resolveAuditScope.execute({
        audits: ['solid'],
        agents: null,
        focus: null,
        signals: new StubProjectPrinciplesGateway().readSignals('/project'),
      });

      expect(names(withMetaSteps(scope))).toEqual(['solid', 'threads', 'report']);
    });
  });

  describe('config boundary rejects invalid audit names', () => {
    it('throws a clear error naming the invalid entry', () => {
      expect(() =>
        parseProjectConfig({
          github: true,
          gitlab: false,
          defaultModel: 'sonnet',
          reviewSkill: 'review-back',
          reviewFollowupSkill: 'review-followup',
          audits: ['clean-architecture', 'made-up-principle'],
        }),
      ).toThrow(/made-up-principle/);
    });
  });

  describe('report scope injection', () => {
    it('emits an authoritative audit-scope block naming the resolved principles', () => {
      const scope = resolveAuditScope.execute({
        audits: ['solid', 'testing'],
        agents: null,
        focus: null,
        signals: new StubProjectPrinciplesGateway().readSignals('/project'),
      });

      const directive = buildAuditScopeDirective(scope);

      expect(directive).toContain('solid');
      expect(directive).toContain('testing');
      expect(directive.toLowerCase()).toContain('skip');
    });
  });
});
