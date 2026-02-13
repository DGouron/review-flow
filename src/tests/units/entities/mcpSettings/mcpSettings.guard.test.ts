import { describe, it, expect } from 'vitest';
import { isValidMcpSettings, parseMcpSettings, hasServerEntry } from '@/entities/mcpSettings/mcpSettings.guard.js';

describe('McpSettings guard', () => {
  it('should validate a settings object with one mcp server', () => {
    const settings = {
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: ['/path/to/mcpServer.js'],
        },
      },
    };

    expect(isValidMcpSettings(settings)).toBe(true);
  });

  it('should reject settings without mcpServers', () => {
    expect(isValidMcpSettings({})).toBe(false);
  });

  it('should confirm server entry exists by name', () => {
    const settings = {
      mcpServers: {
        'review-progress': { command: 'node', args: ['/path/to/mcpServer.js'] },
      },
    };

    expect(hasServerEntry(settings, 'review-progress')).toBe(true);
  });

  it('should return false when server entry does not exist', () => {
    const settings = {
      mcpServers: {
        'other-server': { command: 'python', args: ['server.py'] },
      },
    };

    expect(hasServerEntry(settings, 'review-progress')).toBe(false);
  });

  it('should return false for invalid settings', () => {
    expect(hasServerEntry({}, 'review-progress')).toBe(false);
  });

  it('should parse settings and return typed mcpServers', () => {
    const raw = {
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: ['/path/to/mcpServer.js'],
        },
      },
      someOtherKey: 'preserved',
    };

    const result = parseMcpSettings(raw);

    expect(result.mcpServers['review-progress'].command).toBe('node');
    expect(result.mcpServers['review-progress'].args).toEqual(['/path/to/mcpServer.js']);
  });
});
