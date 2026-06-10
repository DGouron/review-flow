import * as fs from 'node:fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { buildMcpConfigJson } from '@/frameworks/claude/claudeInvoker.js';

vi.mock('node:fs');

describe('buildMcpConfigJson', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith('mcpServer.js')) return true;
      return false;
    });
  });

  it('should return valid JSON with only review-progress server', () => {
    const result = buildMcpConfigJson();
    const parsed = JSON.parse(result);

    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers['review-progress']).toBeDefined();
    expect(parsed.mcpServers['review-progress'].command).toBe('node');
    expect(parsed.mcpServers['review-progress'].args).toHaveLength(1);
    expect(parsed.mcpServers['review-progress'].args[0]).toContain('mcpServer.js');
  });

  it('should contain exactly one MCP server', () => {
    const result = buildMcpConfigJson();
    const parsed = JSON.parse(result);

    expect(Object.keys(parsed.mcpServers)).toHaveLength(1);
  });

  it('should throw when MCP server path is not found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => buildMcpConfigJson()).toThrow('MCP server not found');
  });
});
