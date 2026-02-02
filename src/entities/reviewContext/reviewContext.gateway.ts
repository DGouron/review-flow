import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
} from './reviewContext.js'

export interface ReviewContextGateway {
  create(input: CreateReviewContextInput): CreateReviewContextResult
  delete(localPath: string, mergeRequestId: string): DeleteReviewContextResult
  read(localPath: string, mergeRequestId: string): ReviewContext | null
  exists(localPath: string, mergeRequestId: string): boolean
  getFilePath(localPath: string, mergeRequestId: string): string
}
