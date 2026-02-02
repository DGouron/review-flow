import type { ReviewContextThread } from '../reviewContext/reviewContext.js'

export interface ThreadFetchGateway {
  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[]
}
