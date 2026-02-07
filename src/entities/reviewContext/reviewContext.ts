import type { ReviewContextAction, ReviewContextResult } from './reviewContextAction.schema.js'

export interface ReviewContextThread {
  id: string
  file: string | null
  line: number | null
  status: 'open' | 'resolved'
  body: string
}

export interface ReviewContextAgent {
  name: string
  displayName: string
}

export interface ReviewContextProgress {
  phase: 'pending' | 'initializing' | 'agents-running' | 'synthesizing' | 'publishing' | 'completed'
  currentStep: string | null
  stepsCompleted?: string[]
  agents?: ReviewContextAgent[]
  updatedAt?: string
}

export interface AgentInstructions {
  contextFilePath: string
  critical: string[]
  actionSchema: Record<string, Record<string, string>>
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
  agentInstructions?: AgentInstructions
}

export interface CreateReviewContextInput {
  localPath: string
  mergeRequestId: string
  platform: 'github' | 'gitlab'
  projectPath: string
  mergeRequestNumber: number
  threads?: ReviewContextThread[]
  agents?: ReviewContextAgent[]
}

export interface CreateReviewContextResult {
  success: boolean
  filePath: string
}

export interface DeleteReviewContextResult {
  success: boolean
  deleted: boolean
}
