import { describe, it, expect } from 'vitest';

import { clearEmberMemory } from '@/modules/ember-chat/usecases/clearEmberMemory/clearEmberMemory.usecase.js';
import { EmberMemoryTurnFactory } from '@/tests/factories/emberMemory.factory.js';
import { StubEmberMemoryGateway } from '@/tests/stubs/emberMemory.stub.js';

const PROJECT_PATH = '/projects/alpha';

describe('clearEmberMemory', () => {
  it("empties a project's memory so a later load returns null", async () => {
    const memory = new StubEmberMemoryGateway();
    await memory.appendTurn(PROJECT_PATH, EmberMemoryTurnFactory.create());

    await clearEmberMemory({ memory, projectPath: PROJECT_PATH });

    expect(await memory.load(PROJECT_PATH)).toBeNull();
  });
});
