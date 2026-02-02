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
}

export interface ReviewContext {
  version: string
  mergeRequestId: string
  platform: 'github' | 'gitlab'
  projectPath: string
  mergeRequestNumber: number
  createdAt: string
  threads: ReviewContextThread[]
  actions: unknown[]
  progress: ReviewContextProgress
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
