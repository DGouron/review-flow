import * as fs from 'node:fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  loadProjectConfig,
  getProjectLanguage,
  getProjectRetentionDays,
  getProjectAgentsOrFocusDefaults,
  parseProjectConfig,
} from '@/config/projectConfig.js';
import { clearLogs, getLogs } from '@/frameworks/logging/logBuffer.js';
import {
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
  DEFAULT_DOC_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { ProjectConfigFactory } from '@/tests/factories/projectConfig.factory.js';

vi.mock('node:fs');

describe('loadProjectConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should default language to "en" when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('en');
  });

  it('should use "fr" when explicitly specified in config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('fr');
  });

  it('should default retentionDays to 14 when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.retentionDays).toBe(14);
  });

  it('should leave qualityThreshold undefined when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.qualityThreshold).toBeUndefined();
  });

  it('should accept integer qualityThreshold between 0 and 10', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        qualityThreshold: 7,
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.qualityThreshold).toBe(7);
  });

  it('should reject qualityThreshold outside 0-10 range', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        qualityThreshold: 11,
      }),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(/qualityThreshold/);
  });

  it('should reject non-integer qualityThreshold', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        qualityThreshold: 7.5,
      }),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(/qualityThreshold/);
  });

  it('should accept qualityThreshold of 0 (lowest allowed)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        qualityThreshold: 0,
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.qualityThreshold).toBe(0);
  });

  it('should leave maxDiffLines undefined when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.maxDiffLines).toBeUndefined();
  });

  it('should accept a positive integer maxDiffLines', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        maxDiffLines: 500,
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.maxDiffLines).toBe(500);
  });

  it('should reject a non-integer maxDiffLines', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        maxDiffLines: 500.5,
      }),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(/maxDiffLines/);
  });

  it('should reject a maxDiffLines below 1', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        maxDiffLines: 0,
      }),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(/maxDiffLines/);
  });

  it('should use custom retentionDays when specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        retentionDays: 30,
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.retentionDays).toBe(30);
  });

  it('should fall back to 14 for invalid retentionDays value', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        retentionDays: -5,
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.retentionDays).toBe(14);
  });

  it('should fall back to "en" for an invalid language value', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'de',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('en');
  });
});

describe('getProjectLanguage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return language from project config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
      }),
    );

    expect(getProjectLanguage('/fake/path')).toBe('fr');
  });

  it('should default to "en" when config does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getProjectLanguage('/nonexistent')).toBe('en');
  });
});

describe('getProjectRetentionDays', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return retentionDays from project config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        retentionDays: 30,
      }),
    );

    expect(getProjectRetentionDays('/fake/path')).toBe(30);
  });

  it('should default to 14 when config does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getProjectRetentionDays('/nonexistent')).toBe(14);
  });
});

describe('loadProjectConfig — defaultModel haiku', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return haiku when defaultModel is haiku', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'haiku',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.defaultModel).toBe('haiku');
  });
});

describe('loadProjectConfig — routingPolicy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return routingPolicy when valid policy is provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        routingPolicy: { haikuMaxLines: 50, sonnetMaxLines: 500 },
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.routingPolicy).toEqual({ haikuMaxLines: 50, sonnetMaxLines: 500 });
  });

  it('should return undefined routingPolicy when not provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.routingPolicy).toBeUndefined();
  });
});

describe('loadProjectConfig — reviewFocus derivation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearLogs();
  });

  it('derives reviewSkill as "review-back" when reviewFocus is "back" and reviewSkill is absent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'back', reviewSkill: undefined })),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.reviewSkill).toBe('review-back');
    expect(config?.reviewFocus).toBe('back');
  });

  it('derives reviewSkill as "review-front" for "front" focus', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'front', reviewSkill: undefined })),
    );

    expect(loadProjectConfig('/fake/path')?.reviewSkill).toBe('review-front');
  });

  it('derives reviewSkill as "review-fullstack" for "fullstack" focus', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(
        ProjectConfigFactory.create({ reviewFocus: 'fullstack', reviewSkill: undefined }),
      ),
    );

    expect(loadProjectConfig('/fake/path')?.reviewSkill).toBe('review-fullstack');
  });

  it('derives reviewSkill as "review-doc" for "doc" focus', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'doc', reviewSkill: undefined })),
    );

    expect(loadProjectConfig('/fake/path')?.reviewSkill).toBe('review-doc');
  });

  it('keeps explicit reviewSkill and logs a warning when both reviewFocus and reviewSkill are set', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(
        ProjectConfigFactory.create({ reviewFocus: 'back', reviewSkill: 'my-custom-skill' }),
      ),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.reviewSkill).toBe('my-custom-skill');
    expect(config?.reviewFocus).toBe('back');
    const warnLogs = getLogs().filter((log) => log.level === 'warn');
    expect(warnLogs.length).toBeGreaterThan(0);
    expect(warnLogs[0]?.message).toContain('reviewSkill takes precedence');
  });

  it('throws an error listing the four valid focus values when reviewFocus is invalid', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'mobile' })),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(
      /Invalid reviewFocus.*'front'.*'back'.*'fullstack'.*'doc'/,
    );
  });

  it('still throws when both reviewFocus and reviewSkill are missing (no over-relaxation)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    expect(() => loadProjectConfig('/fake/path')).toThrow(/reviewSkill/);
  });
});

describe('loadProjectConfig — externalLink', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('preserves externalLink when set to an https url', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        externalLink: 'https://notion.so/team',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.externalLink).toBe('https://notion.so/team');
  });

  it('exposes externalLink as undefined when the field is absent (legacy config)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.externalLink).toBeUndefined();
  });

  it('treats an empty string externalLink as undefined', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        externalLink: '',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.externalLink).toBeUndefined();
  });
});

describe('getProjectAgentsOrFocusDefaults', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the explicit agents array when one is set in config', () => {
    const explicitAgents = [{ name: 'security', displayName: 'Security' }];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
          agents: explicitAgents,
        }),
      ),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toEqual(explicitAgents);
  });

  it('falls back to DEFAULT_FRONT_AGENTS when reviewFocus is "front" and no agents array is set', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'front', reviewSkill: undefined })),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toEqual(DEFAULT_FRONT_AGENTS);
  });

  it('falls back to DEFAULT_BACK_AGENTS when reviewFocus is "back"', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'back', reviewSkill: undefined })),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toEqual(DEFAULT_BACK_AGENTS);
  });

  it('falls back to DEFAULT_FULLSTACK_AGENTS when reviewFocus is "fullstack"', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(
        ProjectConfigFactory.create({ reviewFocus: 'fullstack', reviewSkill: undefined }),
      ),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toEqual(DEFAULT_FULLSTACK_AGENTS);
  });

  it('falls back to DEFAULT_DOC_AGENTS when reviewFocus is "doc"', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: 'doc', reviewSkill: undefined })),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toEqual(DEFAULT_DOC_AGENTS);
  });

  it('returns undefined when neither agents nor reviewFocus is set', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(ProjectConfigFactory.create({ reviewFocus: undefined })),
    );

    expect(getProjectAgentsOrFocusDefaults('/fake/path')).toBeUndefined();
  });

  it('returns undefined when the config does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getProjectAgentsOrFocusDefaults('/nonexistent')).toBeUndefined();
  });
});

describe('parseProjectConfig — audits', () => {
  const baseConfig = {
    github: true,
    gitlab: false,
    defaultModel: 'sonnet',
    reviewSkill: 'review-back',
    reviewFollowupSkill: 'review-followup',
  };

  it('parses a valid audits array of catalog principles', () => {
    const config = parseProjectConfig({ ...baseConfig, audits: ['solid', 'testing'] });

    expect(config.audits).toEqual(['solid', 'testing']);
  });

  it('leaves audits undefined when absent', () => {
    const config = parseProjectConfig({ ...baseConfig });

    expect(config.audits).toBeUndefined();
  });

  it('throws naming the invalid entry when an audit is not in the catalog', () => {
    expect(() =>
      parseProjectConfig({ ...baseConfig, audits: ['clean-architecture', 'made-up-principle'] }),
    ).toThrow(/made-up-principle/);
  });

  it('throws when audits is not an array', () => {
    expect(() => parseProjectConfig({ ...baseConfig, audits: 'solid' })).toThrow(/audits/);
  });
});
