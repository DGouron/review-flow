import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';
import { pendingReviewRequestGuard } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.guard.js';
import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import { sanitizeJobId } from '@/shared/services/mcpJobContext.js';

export interface PendingReviewRequestFileSystemGatewayOptions {
  rootDir?: string;
}

function defaultRootDir(): string {
  return join(homedir(), '.claude-review', 'pending');
}

export class PendingReviewRequestFileSystemGateway implements PendingReviewRequestGateway {
  private readonly rootDir: string;

  constructor(options: PendingReviewRequestFileSystemGatewayOptions = {}) {
    this.rootDir = options.rootDir ?? defaultRootDir();
  }

  private ensureRootDir(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private filePath(pendingReviewRequestId: string): string {
    return join(this.rootDir, `${sanitizeJobId(pendingReviewRequestId)}.json`);
  }

  async save(pending: PendingReviewRequest): Promise<void> {
    this.ensureRootDir();
    writeFileSync(
      this.filePath(pending.pendingReviewRequestId),
      `${JSON.stringify(pending, null, 2)}\n`,
    );
  }

  async load(pendingReviewRequestId: string): Promise<PendingReviewRequest | null> {
    const filePath = this.filePath(pendingReviewRequestId);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const result = pendingReviewRequestGuard.safeParse(parsed);
      if (!result.success) {
        return null;
      }
      return result.data;
    } catch {
      return null;
    }
  }

  async listAll(): Promise<PendingReviewRequest[]> {
    if (!existsSync(this.rootDir)) {
      return [];
    }
    const entries = readdirSync(this.rootDir);
    const collected: PendingReviewRequest[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = readFileSync(join(this.rootDir, entry), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const result = pendingReviewRequestGuard.safeParse(parsed);
        if (result.success) {
          collected.push(result.data);
        }
      } catch {
        // Skip unreadable / invalid files; the file system gateway is forgiving.
      }
    }
    return collected;
  }

  async delete(pendingReviewRequestId: string): Promise<boolean> {
    const filePath = this.filePath(pendingReviewRequestId);
    if (!existsSync(filePath)) {
      return false;
    }
    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
