import * as fs from 'node:fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadProjectConfig, getProjectAgentsOrFocusDefaults } from '@/config/projectConfig.js';
import { clearLogs, getLogs } from '@/frameworks/logging/logBuffer.js';
import {
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
  DEFAULT_DOC_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { ProjectConfigFactory } from '@/tests/factories/projectConfig.factory.js';

vi.mock('node:fs');

function mockConfigFileWith(payload: Record<string, unknown>): void {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(payload));
}

describe('SPEC-48 — Review Focus Selection (acceptance)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearLogs();
  });

  describe('Scenario 1: Backend project uses review-back skill', () => {
    it('derives review-back skill and DEFAULT_BACK_AGENTS when reviewFocus is "back" and reviewSkill is absent', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewFocus: 'back', reviewSkill: undefined }),
      );

      const config = loadProjectConfig('/fake/path');
      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(config?.reviewSkill).toBe('review-back');
      expect(config?.reviewFocus).toBe('back');
      expect(agents).toEqual(DEFAULT_BACK_AGENTS);
    });
  });

  describe('Scenario 2: Frontend project uses review-front skill', () => {
    it('derives review-front skill and DEFAULT_FRONT_AGENTS when reviewFocus is "front"', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewFocus: 'front', reviewSkill: undefined }),
      );

      const config = loadProjectConfig('/fake/path');
      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(config?.reviewSkill).toBe('review-front');
      expect(agents).toEqual(DEFAULT_FRONT_AGENTS);
    });
  });

  describe('Scenarios 3 and 11: Fullstack focus deduplicates front + back agents', () => {
    it('derives review-fullstack skill and DEFAULT_FULLSTACK_AGENTS with no duplicate agent names', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewFocus: 'fullstack', reviewSkill: undefined }),
      );

      const config = loadProjectConfig('/fake/path');
      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(config?.reviewSkill).toBe('review-fullstack');
      expect(agents).toEqual(DEFAULT_FULLSTACK_AGENTS);

      const names = (agents ?? []).map((agent) => agent.name);
      const uniqueNames = Array.from(new Set(names));
      expect(names).toEqual(uniqueNames);
    });
  });

  describe('Scenario 3b: Doc focus uses review-doc skill', () => {
    it('derives review-doc skill and DEFAULT_DOC_AGENTS when reviewFocus is "doc"', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewFocus: 'doc', reviewSkill: undefined }),
      );

      const config = loadProjectConfig('/fake/path');
      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(config?.reviewSkill).toBe('review-doc');
      expect(agents).toEqual(DEFAULT_DOC_AGENTS);

      const agentNames = (agents ?? []).map((agent) => agent.name);
      expect(agentNames).not.toContain('react-best-practices');
      expect(agentNames).not.toContain('solid');
      expect(agentNames).not.toContain('ddd');
      expect(agentNames).not.toContain('clean-architecture');
    });
  });

  describe('Scenario 4: Backward compatibility — no reviewFocus uses reviewSkill', () => {
    it('uses explicit reviewSkill when reviewFocus is absent', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewSkill: 'review-front', reviewFocus: undefined }),
      );

      const config = loadProjectConfig('/fake/path');

      expect(config?.reviewSkill).toBe('review-front');
      expect(config?.reviewFocus).toBeUndefined();
    });

    it('returns undefined agents when no agents array and no reviewFocus are set', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewSkill: 'review-front', reviewFocus: undefined }),
      );

      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(agents).toBeUndefined();
    });
  });

  describe('Scenario 5: reviewSkill overrides reviewFocus when both present', () => {
    it('keeps reviewSkill and logs a warning when both are set', () => {
      mockConfigFileWith(
        ProjectConfigFactory.create({ reviewFocus: 'back', reviewSkill: 'my-custom-skill' }),
      );

      const config = loadProjectConfig('/fake/path');

      expect(config?.reviewSkill).toBe('my-custom-skill');
      expect(config?.reviewFocus).toBe('back');

      const warnLogs = getLogs().filter((log) => log.level === 'warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0]?.message).toContain('reviewSkill takes precedence');
    });
  });

  describe('Scenario 6: Invalid reviewFocus value rejected', () => {
    it('throws an error listing the four allowed focus values', () => {
      mockConfigFileWith(ProjectConfigFactory.create({ reviewFocus: 'mobile' }));

      expect(() => loadProjectConfig('/fake/path')).toThrow(
        /Invalid reviewFocus.*'front'.*'back'.*'fullstack'.*'doc'/,
      );
    });

    it('still throws when neither reviewFocus nor reviewSkill is present (regression guard)', () => {
      mockConfigFileWith({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewFollowupSkill: 'review-followup',
      });

      expect(() => loadProjectConfig('/fake/path')).toThrow(/reviewSkill/);
    });
  });

  describe('Scenario 7: Explicit agents array overrides focus-derived defaults', () => {
    it('returns the explicit agents array, not DEFAULT_BACK_AGENTS', () => {
      const explicitAgents = [{ name: 'security', displayName: 'Security' }];
      mockConfigFileWith(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
          agents: explicitAgents,
        }),
      );

      const agents = getProjectAgentsOrFocusDefaults('/fake/path');

      expect(agents).toEqual(explicitAgents);
    });
  });
});
