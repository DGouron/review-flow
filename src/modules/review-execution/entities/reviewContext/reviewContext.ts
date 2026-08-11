import type { ReviewContextAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';

import type { ReviewContextResult } from './reviewContextResult.schema.js';

export interface DiffMetadata {
  baseSha: string;
  headSha: string;
  startSha: string;
}

export interface ReviewContextThreadComment {
  author: string | null;
  body: string;
  createdAt: string;
}

/**
 * `comments` is the thread conversation, oldest first: index 0 is the comment that opened
 * the thread (the review's own finding), later indexes are replies. Position — not the
 * author login — tells them apart, since ReviewFlow posts with the maintainer's token.
 * Optional because a context file persisted before this field existed must still parse.
 */
export interface ReviewContextThread {
  id: string;
  file: string | null;
  line: number | null;
  status: 'open' | 'resolved';
  body: string;
  comments?: ReviewContextThreadComment[];
}

export interface ReviewContextAgent {
  name: string;
  displayName: string;
}

export interface ReviewContextProgress {
  phase:
    | 'pending'
    | 'initializing'
    | 'agents-running'
    | 'synthesizing'
    | 'publishing'
    | 'completed';
  currentStep: string | null;
  stepsCompleted?: string[];
  agents?: ReviewContextAgent[];
  updatedAt?: string;
}

export interface AgentInstructions {
  contextFilePath: string;
  critical: string[];
  actionSchema: Record<string, Record<string, string>>;
}

export interface ReviewContext {
  version: string;
  mergeRequestId: string;
  platform: 'github' | 'gitlab';
  projectPath: string;
  mergeRequestNumber: number;
  createdAt: string;
  threads: ReviewContextThread[];
  actions: ReviewContextAction[];
  progress: ReviewContextProgress;
  result?: ReviewContextResult;
  agentInstructions?: AgentInstructions;
  diffMetadata?: DiffMetadata;
}

export interface CreateReviewContextInput {
  localPath: string;
  mergeRequestId: string;
  platform: 'github' | 'gitlab';
  projectPath: string;
  mergeRequestNumber: number;
  threads?: ReviewContextThread[];
  agents?: ReviewContextAgent[];
  diffMetadata?: DiffMetadata;
}

export interface CreateReviewContextResult {
  success: boolean;
  filePath: string;
}

export interface DeleteReviewContextResult {
  success: boolean;
  deleted: boolean;
}
