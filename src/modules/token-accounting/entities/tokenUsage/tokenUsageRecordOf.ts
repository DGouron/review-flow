import type { ReviewRole } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';
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

/** Usage of one role session of an orchestrated review; its duration is not measured. */
export function roleTokenUsageRecordOf(input: {
  job: RecordedJob;
  jobType: 'review' | 'followup';
  session: RecordedSession;
  role: ReviewRole;
  recordedAt: string;
}): TokenUsageRecord {
  const { job, jobType, session, role, recordedAt } = input;
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
    turns: session.turns,
    role,
  };
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
