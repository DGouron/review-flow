import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import {
  tokenUsageRecordSchema,
  type TokenUsageRecord,
} from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

const USAGE_FILE = '.claude/reviews/usage.jsonl';

export class FilesystemTokenUsageGateway implements TokenUsageGateway {
  async record(record: TokenUsageRecord): Promise<void> {
    const usageDir = join(record.localPath, '.claude', 'reviews');
    if (!existsSync(usageDir)) {
      mkdirSync(usageDir, { recursive: true });
    }
    const filePath = join(record.localPath, USAGE_FILE);
    appendFileSync(filePath, JSON.stringify(record) + '\n');
  }

  async loadAll(localPath: string): Promise<TokenUsageRecord[]> {
    const filePath = join(localPath, USAGE_FILE);
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    const records: TokenUsageRecord[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const result = tokenUsageRecordSchema.safeParse(parsed);
        if (result.success) {
          records.push(result.data);
        }
      } catch {
        // skip invalid lines silently
      }
    }

    return records;
  }
}
