import { describe, it, expect } from 'vitest';
import { formatInitSummary, type InitSummaryInput } from '../../../../cli/formatters/initSummary.js';

function createFakeSummary(overrides?: Partial<InitSummaryInput>): InitSummaryInput {
  return {
    configPath: '/home/user/.config/reviewflow/config.json',
    envPath: '/home/user/.config/reviewflow/.env',
    port: 3847,
    repositoryCount: 2,
    mcpStatus: 'configured',
    gitlabUsername: 'damien',
    githubUsername: 'DGouron',
    ...overrides,
  };
}

describe('formatInitSummary', () => {
  it('should include config file path', () => {
    const result = formatInitSummary(createFakeSummary());

    expect(result).toContain('config.json');
  });

  it('should include .env file path', () => {
    const result = formatInitSummary(createFakeSummary());

    expect(result).toContain('.env');
  });

  it('should include port number', () => {
    const result = formatInitSummary(createFakeSummary({ port: 4000 }));

    expect(result).toContain('4000');
  });

  it('should include repository count', () => {
    const result = formatInitSummary(createFakeSummary({ repositoryCount: 5 }));

    expect(result).toContain('5');
  });

  it('should include next steps', () => {
    const result = formatInitSummary(createFakeSummary());

    expect(result).toContain('reviewflow start');
  });

  it('should show mcp warning when claude not found', () => {
    const result = formatInitSummary(createFakeSummary({ mcpStatus: 'claude-not-found' }));

    expect(result).toContain('Claude');
  });

  it('should show skipped when mcp was skipped', () => {
    const result = formatInitSummary(createFakeSummary({ mcpStatus: 'skipped' }));

    expect(result).toContain('skip');
  });
});
