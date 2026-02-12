import { describe, it, expect, vi } from 'vitest';
import {
  WriteInitConfigUseCase,
  type WriteInitConfigDependencies,
  type WriteInitConfigInput,
} from '../../../../usecases/cli/writeInitConfig.usecase.js';

function createFakeDeps(
  overrides?: Partial<WriteInitConfigDependencies>,
): WriteInitConfigDependencies {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    ...overrides,
  };
}

function createFakeInput(
  overrides?: Partial<WriteInitConfigInput>,
): WriteInitConfigInput {
  return {
    configDir: '/home/user/.config/reviewflow',
    port: 3847,
    gitlabUsername: 'damien',
    githubUsername: 'DGouron',
    repositories: [
      { name: 'my-app', localPath: '/home/user/projects/my-app', enabled: true },
    ],
    gitlabWebhookSecret: 'abc123',
    githubWebhookSecret: 'def456',
    ...overrides,
  };
}

describe('WriteInitConfigUseCase', () => {
  it('should create config directory recursively', () => {
    const deps = createFakeDeps();
    const usecase = new WriteInitConfigUseCase(deps);

    usecase.execute(createFakeInput());

    expect(deps.mkdirSync).toHaveBeenCalledWith(
      '/home/user/.config/reviewflow',
      { recursive: true },
    );
  });

  it('should write config.json with correct structure', () => {
    const deps = createFakeDeps();
    const usecase = new WriteInitConfigUseCase(deps);

    const result = usecase.execute(createFakeInput());

    const writeCall = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => (call[0] as string).endsWith('config.json'),
    );
    expect(writeCall).toBeDefined();

    const config = JSON.parse(writeCall![1] as string);
    expect(config.server.port).toBe(3847);
    expect(config.user.gitlabUsername).toBe('damien');
    expect(config.user.githubUsername).toBe('DGouron');
    expect(config.queue.maxConcurrent).toBe(2);
    expect(config.repositories).toHaveLength(1);
    expect(result.configPath).toContain('config.json');
  });

  it('should write .env file with webhook secrets', () => {
    const deps = createFakeDeps();
    const usecase = new WriteInitConfigUseCase(deps);

    const result = usecase.execute(createFakeInput());

    const writeCall = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => (call[0] as string).endsWith('.env'),
    );
    expect(writeCall).toBeDefined();

    const envContent = writeCall![1] as string;
    expect(envContent).toContain('GITLAB_WEBHOOK_TOKEN=abc123');
    expect(envContent).toContain('GITHUB_WEBHOOK_SECRET=def456');
    expect(result.envPath).toContain('.env');
  });

  it('should handle empty repositories', () => {
    const deps = createFakeDeps();
    const usecase = new WriteInitConfigUseCase(deps);

    const result = usecase.execute(createFakeInput({ repositories: [] }));

    const writeCall = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => (call[0] as string).endsWith('config.json'),
    );
    const config = JSON.parse(writeCall![1] as string);
    expect(config.repositories).toEqual([]);
    expect(result.configPath).toBeDefined();
  });

  it('should use empty string for omitted usernames', () => {
    const deps = createFakeDeps();
    const usecase = new WriteInitConfigUseCase(deps);

    usecase.execute(
      createFakeInput({ gitlabUsername: '', githubUsername: '' }),
    );

    const writeCall = (deps.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => (call[0] as string).endsWith('config.json'),
    );
    const config = JSON.parse(writeCall![1] as string);
    expect(config.user.gitlabUsername).toBe('');
    expect(config.user.githubUsername).toBe('');
  });
});
