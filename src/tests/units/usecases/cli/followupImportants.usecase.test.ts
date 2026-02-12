import { describe, it, expect, vi } from 'vitest';
import { FollowupImportantsUseCase } from '../../../../usecases/cli/followupImportants.usecase.js';

function createMockFetch(response: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  });
}

function createDeps(overrides: Partial<Parameters<typeof FollowupImportantsUseCase.prototype.execute>[1]> = {}) {
  return {
    serverPort: 3000,
    log: vi.fn(),
    error: vi.fn(),
    fetch: createMockFetch({ success: true, triggered: 0, candidates: [], failed: [] }),
    ...overrides,
  };
}

describe('FollowupImportantsUseCase', () => {
  it('should call the batch API endpoint', async () => {
    const fetch = createMockFetch({ success: true, triggered: 0, candidates: [], failed: [] });
    const deps = createDeps({ fetch });
    const usecase = new FollowupImportantsUseCase(deps);

    await usecase.execute({});

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/mr-tracking/followup-importants',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should pass projectPath when provided', async () => {
    const fetch = createMockFetch({ success: true, triggered: 0, candidates: [], failed: [] });
    const deps = createDeps({ fetch });
    const usecase = new FollowupImportantsUseCase(deps);

    await usecase.execute({ project: '/path/to/repo' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ projectPath: '/path/to/repo' }),
      }),
    );
  });

  it('should log message when no candidates found', async () => {
    const deps = createDeps();
    const usecase = new FollowupImportantsUseCase(deps);

    await usecase.execute({});

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('No pending-approval'));
  });

  it('should log triggered count and candidate details', async () => {
    const fetch = createMockFetch({
      success: true,
      triggered: 2,
      candidates: [
        { mrId: 'gitlab-proj-10', mrNumber: 10, title: 'Fix auth' },
        { mrId: 'gitlab-proj-11', mrNumber: 11, title: 'Add tests' },
      ],
      failed: [],
    });
    const deps = createDeps({ fetch });
    const usecase = new FollowupImportantsUseCase(deps);

    await usecase.execute({});

    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('!10'));
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('!11'));
  });

  it('should log failures when some followups fail', async () => {
    const fetch = createMockFetch({
      success: true,
      triggered: 1,
      candidates: [
        { mrId: 'gitlab-proj-10', mrNumber: 10, title: 'Fix auth' },
      ],
      failed: [{ mrId: 'gitlab-proj-11', error: 'timeout' }],
    });
    const deps = createDeps({ fetch });
    const usecase = new FollowupImportantsUseCase(deps);

    await usecase.execute({});

    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('1 failed'));
  });
});
