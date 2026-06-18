import { describe, it, expect } from 'vitest';

import { StubEmberMemoryGateway } from '@/tests/stubs/emberMemory.stub.js';

const PROJECT_A = '/projects/alpha';
const INSIGHT = 'Le projet alpha régresse chaque vendredi.';

describe('StubEmberMemoryGateway insight recording mirrors the filesystem gateway', () => {
  it('records the same insight only once', async () => {
    const gateway = new StubEmberMemoryGateway();
    await gateway.appendInsight(PROJECT_A, INSIGHT);
    await gateway.appendInsight(PROJECT_A, INSIGHT);

    expect((await gateway.load(PROJECT_A))?.insights).toEqual([INSIGHT]);
  });

  it('treats a trailing-whitespace variant as the same insight', async () => {
    const gateway = new StubEmberMemoryGateway();
    await gateway.appendInsight(PROJECT_A, INSIGHT);
    await gateway.appendInsight(PROJECT_A, `  ${INSIGHT}  `);

    expect((await gateway.load(PROJECT_A))?.insights).toEqual([INSIGHT]);
  });

  it('never records a blank insight', async () => {
    const gateway = new StubEmberMemoryGateway();
    await gateway.appendInsight(PROJECT_A, '   ');

    expect(await gateway.load(PROJECT_A)).toBeNull();
  });
});
