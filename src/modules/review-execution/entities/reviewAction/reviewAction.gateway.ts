import type { ExecutionResult } from '@/shared/foundation/executionGateway.base.js';

import type { DiffMetadata } from '../reviewContext/reviewContext.js';
import type { ReviewAction } from './reviewAction.js';

export interface ExecutionContext {
  projectPath: string;
  mrNumber: number;
  localPath: string;
  diffMetadata?: DiffMetadata;
  baseUrl: string | null;
}

export interface ReviewActionGateway {
  execute(actions: ReviewAction[], context: ExecutionContext): Promise<ExecutionResult>;
}
