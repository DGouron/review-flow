import { describe, it, expect, vi } from 'vitest';
import {
  ConfigureMcpUseCase,
  type ConfigureMcpDependencies,
} from '../../../../usecases/cli/configureMcp.usecase.js';

function createFakeDeps(
  overrides?: Partial<ConfigureMcpDependencies>,
): ConfigureMcpDependencies {
  return {
    isClaudeInstalled: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    copyFileSync: vi.fn(),
    resolveMcpServerPath: vi.fn(() => '/path/to/dist/mcpServer.js'),
    settingsPath: '/home/user/.claude/settings.json',
    ...overrides,
  };
}

describe('ConfigureMcpUseCase', () => {
  it('should return claude-not-found when claude is not installed', () => {
    const deps = createFakeDeps({ isClaudeInstalled: vi.fn(() => false) });
    const usecase = new ConfigureMcpUseCase(deps);

    const result = usecase.execute();

    expect(result).toBe('claude-not-found');
    expect(deps.writeFileSync).not.toHaveBeenCalled();
  });

  it('should configure mcp when settings file does not exist', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
    });
    const usecase = new ConfigureMcpUseCase(deps);

    const result = usecase.execute();

    expect(result).toBe('configured');
    expect(deps.writeFileSync).toHaveBeenCalled();
    const writtenContent = JSON.parse(
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1],
    );
    expect(writtenContent.mcpServers['review-progress']).toBeDefined();
    expect(writtenContent.mcpServers['review-progress'].command).toBe('node');
  });

  it('should return already-configured when mcp is already set with correct path', () => {
    const existingSettings = {
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: ['/path/to/dist/mcpServer.js'],
        },
      },
    };
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => JSON.stringify(existingSettings)),
    });
    const usecase = new ConfigureMcpUseCase(deps);

    const result = usecase.execute();

    expect(result).toBe('already-configured');
    expect(deps.writeFileSync).not.toHaveBeenCalled();
  });

  it('should update mcp config when path has changed', () => {
    const existingSettings = {
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: ['/old/path/mcpServer.js'],
        },
      },
    };
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => JSON.stringify(existingSettings)),
    });
    const usecase = new ConfigureMcpUseCase(deps);

    const result = usecase.execute();

    expect(result).toBe('configured');
    expect(deps.copyFileSync).toHaveBeenCalled();
  });

  it('should preserve existing mcp servers when adding review-progress', () => {
    const existingSettings = {
      mcpServers: {
        'other-server': { command: 'python', args: ['server.py'] },
      },
    };
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => JSON.stringify(existingSettings)),
    });
    const usecase = new ConfigureMcpUseCase(deps);

    usecase.execute();

    const writtenContent = JSON.parse(
      (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1],
    );
    expect(writtenContent.mcpServers['other-server']).toBeDefined();
    expect(writtenContent.mcpServers['review-progress']).toBeDefined();
  });

  it('should backup settings before modifying', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn(() => '{}'),
    });
    const usecase = new ConfigureMcpUseCase(deps);

    usecase.execute();

    expect(deps.copyFileSync).toHaveBeenCalledWith(
      '/home/user/.claude/settings.json',
      '/home/user/.claude/settings.json.bak',
    );
  });
});
