import { describe, it, expect } from 'vitest';

import { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';
import { ChangedFilesFactory } from '@/tests/factories/changedFiles.factory.js';
import { StubChangedFilesFetchGateway } from '@/tests/stubs/changedFilesFetch.stub.js';

function buildUseCase(): {
  gateway: StubChangedFilesFetchGateway;
  useCase: GuardDiffSizeUseCase;
} {
  const gateway = new StubChangedFilesFetchGateway();
  return { gateway, useCase: new GuardDiffSizeUseCase({ changedFilesFetchGateway: gateway }) };
}

describe('GuardDiffSizeUseCase', () => {
  it('blocks an oversized merge request with counted lines and budget in the message', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(
      42,
      ChangedFilesFactory.list([{ path: 'src/big.ts', additions: 2000, deletions: 500 }]),
    );

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict.kind).toBe('blocked');
    if (verdict.kind === 'blocked') {
      expect(verdict.countedLines).toBe(2500);
      expect(verdict.budget).toBe(2000);
      expect(verdict.message).toContain('2500');
      expect(verdict.message).toContain('2000');
    }
  });

  it('allows a merge request under the budget without a message', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(
      42,
      ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 50, deletions: 10 }]),
    );

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict).toEqual({ kind: 'allowed' });
  });

  it('posts a French split message mentioning actionable tips', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(
      42,
      ChangedFilesFactory.list([{ path: 'src/big.ts', additions: 2100, deletions: 0 }]),
    );

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict.kind).toBe('blocked');
    if (verdict.kind === 'blocked') {
      expect(verdict.message).toContain('Revue refusée');
      expect(verdict.message).toContain('découpez');
    }
  });

  it('is fail-open when the gateway throws (processed normally, no message)', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setFailure(42);

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict).toEqual({ kind: 'allowed' });
  });

  it('is fail-open when the gateway returns null (no changed files available)', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(42, null);

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict).toEqual({ kind: 'allowed' });
  });

  it('blocks against a per-repo override budget below the counted size', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(
      42,
      ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 800, deletions: 0 }]),
    );

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 500,
    });

    expect(verdict.kind).toBe('blocked');
  });

  it('blocks against the default budget when counted size exceeds 2000', () => {
    const { gateway, useCase } = buildUseCase();
    gateway.setResponse(
      42,
      ChangedFilesFactory.list([{ path: 'src/a.ts', additions: 2100, deletions: 0 }]),
    );

    const verdict = useCase.execute({
      projectIdentifier: 'group/project',
      mergeRequestNumber: 42,
      budget: 2000,
    });

    expect(verdict.kind).toBe('blocked');
  });
});
