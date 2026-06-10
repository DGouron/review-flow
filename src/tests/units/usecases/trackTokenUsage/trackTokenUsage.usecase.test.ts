import { describe, it, expect, beforeEach } from 'vitest';

import { TrackTokenUsageUseCase } from '@/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';

describe('TrackTokenUsageUseCase', () => {
  let gateway: StubTokenUsageGateway;
  let useCase: TrackTokenUsageUseCase;

  beforeEach(() => {
    gateway = new StubTokenUsageGateway();
    useCase = new TrackTokenUsageUseCase(gateway);
  });

  it('should delegate to gateway', async () => {
    const record = TokenUsageRecordFactory.create();

    await useCase.execute(record);

    expect(gateway.records).toHaveLength(1);
    expect(gateway.records[0]).toEqual(record);
  });

  it('should record multiple calls', async () => {
    const record1 = TokenUsageRecordFactory.create({ jobId: 'job-1' });
    const record2 = TokenUsageRecordFactory.create({ jobId: 'job-2' });

    await useCase.execute(record1);
    await useCase.execute(record2);

    expect(gateway.records).toHaveLength(2);
  });
});
