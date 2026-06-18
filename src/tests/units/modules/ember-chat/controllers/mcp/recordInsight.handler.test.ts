import { describe, it, expect } from 'vitest';

import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import type { EmberRecurringInsight } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import { createRecordInsightHandler } from '@/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.js';

const PROJECT_A = '/projects/alpha';
const INSIGHT = 'Le projet X régresse chaque vendredi.';

interface RecordedCall {
  projectPath: string;
  insight: EmberRecurringInsight;
}

class RecordingMemoryGateway implements EmberMemoryGateway {
  readonly calls: RecordedCall[] = [];

  async load(): Promise<null> {
    return null;
  }

  async appendTurn(): Promise<void> {
    return Promise.resolve();
  }

  async appendInsight(projectPath: string, insight: EmberRecurringInsight): Promise<void> {
    this.calls.push({ projectPath, insight });
  }

  async clear(): Promise<void> {
    return Promise.resolve();
  }
}

class RejectingMemoryGateway implements EmberMemoryGateway {
  async load(): Promise<null> {
    return null;
  }

  async appendTurn(): Promise<void> {
    return Promise.resolve();
  }

  async appendInsight(_projectPath: string, _insight: EmberRecurringInsight): Promise<void> {
    throw new Error('write failed');
  }

  async clear(): Promise<void> {
    return Promise.resolve();
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createRecordInsightHandler', () => {
  it('forwards a derived insight to the memory gateway for the answered project', async () => {
    const memory = new RecordingMemoryGateway();
    const record = createRecordInsightHandler({ memory });

    const result = record({ projectPath: PROJECT_A, insight: INSIGHT });
    await flush();

    expect(result.isError ?? false).toBe(false);
    expect(memory.calls).toEqual([{ projectPath: PROJECT_A, insight: INSIGHT }]);
  });

  it('records nothing for a blank insight yet still reports success', async () => {
    const memory = new RecordingMemoryGateway();
    const record = createRecordInsightHandler({ memory });

    const result = record({ projectPath: PROJECT_A, insight: '   ' });
    await flush();

    expect(result.isError ?? false).toBe(false);
    expect(memory.calls).toEqual([]);
  });

  it('records nothing when the insight argument is missing', async () => {
    const memory = new RecordingMemoryGateway();
    const record = createRecordInsightHandler({ memory });

    const result = record({ projectPath: PROJECT_A });
    await flush();

    expect(result.isError ?? false).toBe(false);
    expect(memory.calls).toEqual([]);
  });

  it('rejects a call without a project path', async () => {
    const memory = new RecordingMemoryGateway();
    const record = createRecordInsightHandler({ memory });

    const result = record({ insight: INSIGHT });
    await flush();

    expect(result.isError).toBe(true);
    expect(memory.calls).toEqual([]);
  });

  it('still reports success when the memory write fails (best-effort, non-fatal)', async () => {
    const memory = new RejectingMemoryGateway();
    const record = createRecordInsightHandler({ memory });

    const result = record({ projectPath: PROJECT_A, insight: INSIGHT });
    await flush();

    expect(result.isError ?? false).toBe(false);
  });
});
