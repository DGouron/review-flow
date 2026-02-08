import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureProjectMcpConfig } from '../../../../frameworks/claude/claudeInvoker.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('ensureProjectMcpConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // By default, make resolveMcpServerPath succeed (file exists)
    // and ensureProjectMcpConfig create new file (no existing .mcp.json)
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith('mcpServer.js')) return true;
      return false;
    });
  });

  it('should create .mcp.json when file does not exist', () => {
    ensureProjectMcpConfig('/tmp/my-project');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/my-project/.mcp.json',
      expect.any(String),
    );

    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers['review-progress']).toBeDefined();
    expect(parsed.mcpServers['review-progress'].command).toBe('node');
    expect(parsed.mcpServers['review-progress'].args).toHaveLength(1);
    expect(parsed.mcpServers['review-progress'].args[0]).toContain('mcpServer.js');
  });

  it('should skip when review-progress config already exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith('mcpServer.js')) return true;
      if (pathStr.endsWith('.mcp.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: ['/some/existing/path.js'],
        },
      },
    }));

    ensureProjectMcpConfig('/tmp/my-project');

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should merge with existing config when review-progress is missing', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith('mcpServer.js')) return true;
      if (pathStr.endsWith('.mcp.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      mcpServers: {
        'other-server': { command: 'python', args: ['serve.py'] },
      },
    }));

    ensureProjectMcpConfig('/tmp/my-project');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.mcpServers['other-server']).toBeDefined();
    expect(parsed.mcpServers['review-progress']).toBeDefined();
  });

  it('should not throw on filesystem error', () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('permission denied');
    });

    expect(() => ensureProjectMcpConfig('/tmp/my-project')).not.toThrow();
  });

  it('should not throw on invalid JSON in existing file', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith('mcpServer.js')) return true;
      if (pathStr.endsWith('.mcp.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

    expect(() => ensureProjectMcpConfig('/tmp/my-project')).not.toThrow();
  });
});
