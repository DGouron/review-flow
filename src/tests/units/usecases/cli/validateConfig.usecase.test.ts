import { describe, it, expect, vi } from 'vitest';
import {
  ValidateConfigUseCase,
  type ValidateConfigDependencies,
} from '../../../../usecases/cli/validateConfig.usecase.js';

function createFakeDeps(
  overrides?: Partial<ValidateConfigDependencies>,
): ValidateConfigDependencies {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        server: { port: 3847 },
        user: { gitlabUsername: 'user', githubUsername: 'user' },
        queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
        repositories: [],
      }),
    ),
    ...overrides,
  };
}

describe('ValidateConfigUseCase', () => {
  it('should return not-found when config file does not exist', () => {
    const deps = createFakeDeps({ existsSync: vi.fn(() => false) });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({ configPath: '/missing/config.json', envPath: '/missing/.env' });

    expect(result.status).toBe('not-found');
  });

  it('should return valid for correct config', () => {
    const deps = createFakeDeps();
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/home/user/.config/reviewflow/config.json',
      envPath: '/home/user/.config/reviewflow/.env',
    });

    expect(result.status).toBe('valid');
    expect(result.issues).toHaveLength(0);
  });

  it('should detect invalid JSON', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn((path: string) => {
        if (path.endsWith('config.json')) return 'not json{';
        return 'GITLAB_WEBHOOK_TOKEN=abc\nGITHUB_WEBHOOK_SECRET=def';
      }),
    });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({
      configPath: '/config.json',
      envPath: '/.env',
    });

    expect(result.status).toBe('invalid');
    expect(result.issues.some(i => i.field === 'config.json')).toBe(true);
  });

  it('should detect invalid port', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn((path: string) => {
        if (path.endsWith('config.json')) {
          return JSON.stringify({
            server: { port: 99999 },
            user: { gitlabUsername: 'u', githubUsername: 'u' },
            queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
            repositories: [],
          });
        }
        return 'GITLAB_WEBHOOK_TOKEN=abc\nGITHUB_WEBHOOK_SECRET=def';
      }),
    });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({ configPath: '/config.json', envPath: '/.env' });

    expect(result.status).toBe('invalid');
    expect(result.issues.some(i => i.field === 'server.port')).toBe(true);
  });

  it('should detect missing .env file', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => !path.endsWith('.env')),
      readFileSync: vi.fn(() =>
        JSON.stringify({
          server: { port: 3847 },
          user: { gitlabUsername: 'u', githubUsername: 'u' },
          queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
          repositories: [],
        }),
      ),
    });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({ configPath: '/config.json', envPath: '/.env' });

    expect(result.status).toBe('invalid');
    expect(result.issues.some(i => i.field === '.env')).toBe(true);
  });

  it('should detect missing required fields', () => {
    const deps = createFakeDeps({
      readFileSync: vi.fn((path: string) => {
        if (path.endsWith('config.json')) {
          return JSON.stringify({ server: { port: 3847 } });
        }
        return 'GITLAB_WEBHOOK_TOKEN=abc\nGITHUB_WEBHOOK_SECRET=def';
      }),
    });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({ configPath: '/config.json', envPath: '/.env' });

    expect(result.status).toBe('invalid');
    expect(result.issues.some(i => i.field === 'user')).toBe(true);
  });

  it('should detect non-existent repository paths', () => {
    const deps = createFakeDeps({
      existsSync: vi.fn((path: string) => !path.startsWith('/nonexistent')),
      readFileSync: vi.fn((path: string) => {
        if (path.endsWith('config.json')) {
          return JSON.stringify({
            server: { port: 3847 },
            user: { gitlabUsername: 'u', githubUsername: 'u' },
            queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
            repositories: [
              { name: 'repo', localPath: '/nonexistent/repo', enabled: true },
            ],
          });
        }
        return 'GITLAB_WEBHOOK_TOKEN=abc\nGITHUB_WEBHOOK_SECRET=def';
      }),
    });
    const usecase = new ValidateConfigUseCase(deps);

    const result = usecase.execute({ configPath: '/config.json', envPath: '/.env' });

    expect(result.status).toBe('invalid');
    expect(result.issues.some(i => i.field === 'repositories')).toBe(true);
  });
});
