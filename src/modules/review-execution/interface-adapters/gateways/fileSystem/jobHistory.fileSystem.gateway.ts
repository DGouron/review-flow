import { existsSync, mkdirSync } from 'node:fs';
import { appendFile, readdir, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from 'pino';

import type {
  JobHistoryGateway,
  PruneJobHistoryResult,
} from '@/modules/review-execution/entities/job/jobHistory.gateway.js';
import { jobRecordGuard } from '@/modules/review-execution/entities/job/jobRecord.guard.js';
import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';

const DATE_FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface JobHistoryFileSystemGatewayOptions {
  rootDir?: string;
  logger: Logger;
}

function defaultRootDir(): string {
  return join(homedir(), '.claude-review', 'jobs');
}

function fileNameForCompletedAt(completedAt: string): string {
  return `${completedAt.slice(0, 10)}.jsonl`;
}

function fileDateFromName(filename: string): Date | null {
  const match = filename.match(DATE_FILENAME_PATTERN);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function retentionThreshold(retentionDays: number, now: Date): Date {
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export class JobHistoryFileSystemGateway implements JobHistoryGateway {
  private readonly rootDir: string;
  private readonly logger: Logger;

  constructor(options: JobHistoryFileSystemGatewayOptions) {
    this.rootDir = options.rootDir ?? defaultRootDir();
    this.logger = options.logger;
  }

  private ensureRootDir(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  async appendRecord(record: JobRecord): Promise<void> {
    this.ensureRootDir();
    const filePath = join(this.rootDir, fileNameForCompletedAt(record.completedAt));
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  }

  async loadRecordsWithinWindow(retentionDays: number, now: Date): Promise<JobRecord[]> {
    if (!existsSync(this.rootDir)) {
      return [];
    }
    const threshold = retentionThreshold(retentionDays, now);
    const entries = await readdir(this.rootDir);
    const collected: JobRecord[] = [];
    for (const entry of entries) {
      const fileDate = fileDateFromName(entry);
      if (!fileDate) continue;
      if (fileDate < threshold) continue;
      const records = await this.readFileRecords(join(this.rootDir, entry));
      collected.push(...records);
    }
    return collected;
  }

  async deleteRecordsOutsideWindow(
    retentionDays: number,
    now: Date,
  ): Promise<PruneJobHistoryResult> {
    if (!existsSync(this.rootDir)) {
      return { deletedFilenames: [] };
    }
    const threshold = retentionThreshold(retentionDays, now);
    const entries = await readdir(this.rootDir);
    const deletedFilenames: string[] = [];
    for (const entry of entries) {
      const fileDate = fileDateFromName(entry);
      if (!fileDate) continue;
      if (fileDate >= threshold) continue;
      try {
        await unlink(join(this.rootDir, entry));
        deletedFilenames.push(entry);
      } catch {
        // Best-effort: a file we cannot delete is left in place silently.
      }
    }
    return { deletedFilenames };
  }

  private async readFileRecords(filePath: string): Promise<JobRecord[]> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      return [];
    }
    const lines = raw.split('\n');
    const records: JobRecord[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().length === 0) continue;
      const parsedRecord = this.parseLine(line, index + 1);
      if (parsedRecord) {
        records.push(parsedRecord);
      }
    }
    return records;
  }

  private parseLine(line: string, lineNumber: number): JobRecord | null {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      this.logger.warn({ lineNumber }, `Ligne ${lineNumber} illisible, ignorée`);
      return null;
    }
    const result = jobRecordGuard.safeParse(raw);
    if (!result.success) {
      this.logger.warn({ lineNumber }, `Ligne ${lineNumber} illisible, ignorée`);
      return null;
    }
    return result.data;
  }
}
