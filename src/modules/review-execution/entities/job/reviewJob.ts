import type { ClaudeModelName } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';
import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { ReviewProgress } from '@/modules/review-execution/entities/progress/progress.type.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';

export interface ReviewJob {
  id: string;
  platform: 'gitlab' | 'github';
  projectPath: string;
  localPath: string;
  mrNumber: number;
  skill: string;
  mrUrl: string;
  sourceBranch: string;
  targetBranch: string;
  jobType?: 'review' | 'followup';
  language?: Language;
  model?: ClaudeModelName;
  title?: string;
  description?: string;
  assignedBy?: {
    username: string;
    displayName?: string;
  };
  // The actual author of the MR/PR (distinct from assignedBy, which is the reviewer/assignee).
  author?: {
    username: string;
    displayName?: string;
  };
  sizeMetrics?: {
    additions: number | null;
    deletions: number | null;
    filesChanged: number | null;
  };
  sourceForkCloneUrl?: string;
  auditScope?: AgentDefinition[];
}

export interface JobStatus {
  job: ReviewJob;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: ReviewProgress;
}
