import type { ReviewAction } from './reviewAction.js'

export interface ExecutionContext {
  projectPath: string
  mrNumber: number
  localPath: string
}

export interface ExecutionResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
}

export type CommandExecutor = (command: string, args: string[], cwd: string) => void

export interface ReviewActionGateway {
  execute(actions: ReviewAction[], context: ExecutionContext): Promise<ExecutionResult>
}
