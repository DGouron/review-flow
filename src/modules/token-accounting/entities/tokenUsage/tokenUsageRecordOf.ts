import type {
  TokenUsage,
  TokenUsageRecord,
} from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

interface RecordedJob {
  id: string;
  mrNumber: number;
  platform: TokenUsageRecord['platform'];
  projectPath: string;
  localPath: string;
}

interface RecordedSession {
  sessionId: string;
  model: string;
  turns: number;
  usage: TokenUsage;
}

export function tokenUsageRecordOf(input: {
  job: RecordedJob;
  jobType: 'review' | 'followup';
  session: RecordedSession;
  durationMs: number;
  recordedAt: string;
}): TokenUsageRecord {
  const { job, jobType, session, durationMs, recordedAt } = input;
  return {
    jobId: job.id,
    mrNumber: job.mrNumber,
    platform: job.platform,
    projectPath: job.projectPath,
    localPath: job.localPath,
    model: session.model,
    recordedAt,
    usage: session.usage,
    sessionId: session.sessionId,
    jobType,
    durationMs,
    turns: session.turns,
  };
}
