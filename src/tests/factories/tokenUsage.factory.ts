import type {
  TokenUsage,
  TokenUsageRecord,
} from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export class TokenUsageFactory {
  static create(overrides?: Partial<TokenUsage>): TokenUsage {
    return {
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 500,
      costUsd: 0.01,
      ...overrides,
    };
  }
}

export class TokenUsageRecordFactory {
  static create(overrides?: Partial<TokenUsageRecord>): TokenUsageRecord {
    return {
      jobId: 'job-test-123',
      mrNumber: 42,
      platform: 'gitlab',
      projectPath: 'owner/repo',
      model: 'claude-opus-4-7',
      recordedAt: '2025-05-14T10:00:00Z',
      localPath: '/tmp/test-project',
      usage: TokenUsageFactory.create(),
      ...overrides,
    };
  }
}
