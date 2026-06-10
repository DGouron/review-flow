import { describe, it, expect, beforeEach } from 'vitest';

import { MEMBER_ACCESS_LEVELS } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';
import { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import { StubMemberAccessGateway } from '@/tests/stubs/memberAccess.stub.js';

describe('IsTrustedActorUseCase', () => {
  let gateway: StubMemberAccessGateway;
  let useCase: IsTrustedActorUseCase;

  beforeEach(() => {
    gateway = new StubMemberAccessGateway();
    useCase = new IsTrustedActorUseCase(gateway);
  });

  it('trusts a Developer+ actor', async () => {
    gateway.setAccess('alice', MEMBER_ACCESS_LEVELS.developer);

    const trusted = await useCase.execute({ username: 'alice', projectPath: 'org/project' });

    expect(trusted).toBe(true);
    expect(gateway.calls).toEqual([{ projectPath: 'org/project', username: 'alice' }]);
  });

  it('does not trust an actor below Developer', async () => {
    gateway.setAccess('bob', MEMBER_ACCESS_LEVELS.reporter);

    const trusted = await useCase.execute({ username: 'bob', projectPath: 'org/project' });

    expect(trusted).toBe(false);
  });

  it('does not trust an unknown username (fail-closed)', async () => {
    const trusted = await useCase.execute({ username: 'stranger', projectPath: 'org/project' });

    expect(trusted).toBe(false);
  });

  it('does not trust when the gateway throws (fail-closed)', async () => {
    gateway.setShouldFail(true);

    const trusted = await useCase.execute({ username: 'alice', projectPath: 'org/project' });

    expect(trusted).toBe(false);
  });
});
