import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMcpServerPath } from '../../../../frameworks/claude/claudeInvoker.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('resolveMcpServerPath', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return path when MCP server file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = resolveMcpServerPath();

    expect(result).toContain('mcpServer.js');
  });

  it('should throw with helpful message when MCP server not found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => resolveMcpServerPath()).toThrow(/MCP server not found/);
    expect(() => resolveMcpServerPath()).toThrow(/yarn build/);
  });
});
