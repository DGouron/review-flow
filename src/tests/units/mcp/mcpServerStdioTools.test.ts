import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../mcp/mcpLogger.js', () => ({
  mcpLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    getLogPath: vi.fn().mockReturnValue('/tmp/test.log'),
  },
}));

import { TOOL_DEFINITIONS } from '../../../mcp/mcpServerStdio.js';

describe('mcpServerStdio TOOL_DEFINITIONS', () => {
  it('exposes a record_insight tool taking a projectPath and an insight', () => {
    const tool = TOOL_DEFINITIONS.find((definition) => definition.name === 'record_insight');

    expect(tool).toBeDefined();
    expect(tool?.inputSchema.properties.projectPath?.type).toBe('string');
    expect(tool?.inputSchema.properties.insight?.type).toBe('string');
    expect(tool?.inputSchema.required).toEqual(['projectPath', 'insight']);
  });
});
