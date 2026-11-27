import { homedir } from 'node:os';
import { join } from 'node:path';

export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/[:/\\]/g, '-');
}

export function jobContextDirectory(): string {
  return join(homedir(), '.claude-review', 'jobs');
}

export function getJobContextFilePath(jobId: string): string {
  return join(jobContextDirectory(), `${sanitizeJobId(jobId)}.json`);
}
