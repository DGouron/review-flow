import type { ReviewContextAction, ReviewContextResult } from './reviewContextAction.schema.js'

export interface ReviewContextThread {
  id: string
  file: string | null
  line: number | null
  status: 'open' | 'resolved'
  body: string
}

export interface ReviewContextProgress {
  phase: 'pending' | 'initializing' | 'agents-running' | 'synthesizing' | 'publishing' | 'completed'
  currentStep: string | null
  stepsCompleted?: string[]
  updatedAt?: string
}

export interface ReviewContext {
  version: string
  mergeRequestId: string
  platform: 'github' | 'gitlab'
  projectPath: string
  mergeRequestNumber: number
  createdAt: string
  threads: ReviewContextThread[]
  actions: ReviewContextAction[]
  progress: ReviewContextProgress
  result?: ReviewContextResult
}

export interface CreateReviewContextInput {
  localPath: string
  mergeRequestId: string
  platform: 'github' | 'gitlab'
  projectPath: string
  mergeRequestNumber: number
  threads?: ReviewContextThread[]
}

export interface CreateReviewContextResult {
  success: boolean
  filePath: string
}

export interface DeleteReviewContextResult {
  success: boolean
  deleted: boolean
}
