import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
  ReviewContextProgress,
} from './reviewContext.js'
import type { ReviewContextAction, ReviewContextResult } from './reviewContextAction.schema.js'

export interface UpdateResult {
  success: boolean
}

export interface ReviewContextGateway {
  create(input: CreateReviewContextInput): CreateReviewContextResult
  delete(localPath: string, mergeRequestId: string): DeleteReviewContextResult
  read(localPath: string, mergeRequestId: string): ReviewContext | null
  exists(localPath: string, mergeRequestId: string): boolean
  getFilePath(localPath: string, mergeRequestId: string): string
  appendAction(localPath: string, mergeRequestId: string, action: ReviewContextAction): UpdateResult
  updateProgress(localPath: string, mergeRequestId: string, progress: ReviewContextProgress): UpdateResult
  setResult(localPath: string, mergeRequestId: string, result: ReviewContextResult): UpdateResult
}
