import { join } from 'node:path';
import { homedir } from 'node:os';

export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/[:/\\]/g, '-');
}

export function getJobContextFilePath(jobId: string): string {
  const jobsDir = join(homedir(), '.claude-review', 'jobs');
  return join(jobsDir, `${sanitizeJobId(jobId)}.json`);
}
