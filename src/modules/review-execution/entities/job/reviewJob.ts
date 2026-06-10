import type { ClaudeModelName } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';
import type { ReviewProgress } from '@/modules/review-execution/entities/progress/progress.type.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';

export interface ReviewJob {
  id: string; // Unique identifier: platform:project:mrNumber
  platform: 'gitlab' | 'github';
  projectPath: string;
  localPath: string;
  mrNumber: number;
  skill: string;
  mrUrl: string;
  sourceBranch: string;
  targetBranch: string;
  // Job type: review or followup
  jobType?: 'review' | 'followup';
  // Output language for the review
  language?: Language;
  // Model selected by routing for this job
  model?: ClaudeModelName;
  // Optional MR metadata
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
  // Diff size metrics. Any field may be null when the platform does not provide it.
  sizeMetrics?: {
    additions: number | null;
    deletions: number | null;
    filesChanged: number | null;
  };
  // SPEC-170 FR-8: clone URL of the source fork for cross-fork PRs (GitHub).
  // null/undefined means the MR/PR source is the same repository as the base.
  sourceForkCloneUrl?: string;
}

export interface JobStatus {
  job: ReviewJob;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: ReviewProgress;
}
