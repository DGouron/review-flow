import * as fs from 'node:fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ProjectConfigRoutingPolicyGateway } from '@/modules/review-execution/interface-adapters/gateways/projectConfig/routingPolicy.projectConfig.gateway.js';

vi.mock('node:fs');

describe('ProjectConfigRoutingPolicyGateway', () => {
  const gateway = new ProjectConfigRoutingPolicyGateway();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null when config.json does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await gateway.load('/fake/path');

    expect(result).toBeNull();
  });

  it('returns null when config.json has no routingPolicy field', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const result = await gateway.load('/fake/path');

    expect(result).toBeNull();
  });

  it('returns the routingPolicy object when config.json has a valid routingPolicy', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review',
        reviewFollowupSkill: 'review-followup',
        routingPolicy: {
          haikuMaxLines: 50,
          sonnetMaxLines: 500,
        },
      }),
    );

    const result = await gateway.load('/fake/path');

    expect(result).toEqual({ haikuMaxLines: 50, sonnetMaxLines: 500 });
  });
});
