import type { ReviewContextGateway, UpdateResult } from '../../entities/reviewContext/reviewContext.gateway.js'
import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
  ReviewContextProgress,
} from '../../entities/reviewContext/reviewContext.js'
import type { ReviewContextAction, ReviewContextResult } from '../../entities/reviewContext/reviewContextAction.schema.js'
import { ReviewContextFactory } from '../factories/reviewContext.factory.js'

export class StubReviewContextGateway implements ReviewContextGateway {
  private contexts = new Map<string, ReviewContext>()

  setContext(mergeRequestId: string, context: ReviewContext): void {
    this.contexts.set(mergeRequestId, context)
  }

  updateContextProgress(mergeRequestId: string, progress: ReviewContextProgress): void {
    const context = this.contexts.get(mergeRequestId)
    if (context) {
      context.progress = { ...progress, updatedAt: new Date().toISOString() }
    }
  }

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const context = ReviewContextFactory.create({
      mergeRequestId: input.mergeRequestId,
      platform: input.platform,
      projectPath: input.projectPath,
      mergeRequestNumber: input.mergeRequestNumber,
      threads: input.threads ?? [],
    })
    this.contexts.set(input.mergeRequestId, context)
    return {
      success: true,
      filePath: this.getFilePath(input.localPath, input.mergeRequestId),
    }
  }

  delete(_localPath: string, mergeRequestId: string): DeleteReviewContextResult {
    const existed = this.contexts.has(mergeRequestId)
    this.contexts.delete(mergeRequestId)
    return { success: true, deleted: existed }
  }

  read(_localPath: string, mergeRequestId: string): ReviewContext | null {
    return this.contexts.get(mergeRequestId) ?? null
  }

  exists(_localPath: string, mergeRequestId: string): boolean {
    return this.contexts.has(mergeRequestId)
  }

  getFilePath(localPath: string, mergeRequestId: string): string {
    return `${localPath}/.claude/reviews/logs/${mergeRequestId}.json`
  }

  appendAction(_localPath: string, mergeRequestId: string, action: ReviewContextAction): UpdateResult {
    const context = this.contexts.get(mergeRequestId)
    if (!context) {
      return { success: false }
    }
    context.actions.push(action)
    return { success: true }
  }

  updateProgress(_localPath: string, mergeRequestId: string, progress: ReviewContextProgress): UpdateResult {
    const context = this.contexts.get(mergeRequestId)
    if (!context) {
      return { success: false }
    }
    context.progress = { ...progress, updatedAt: new Date().toISOString() }
    return { success: true }
  }

  setResult(_localPath: string, mergeRequestId: string, result: ReviewContextResult): UpdateResult {
    const context = this.contexts.get(mergeRequestId)
    if (!context) {
      return { success: false }
    }
    context.result = result
    return { success: true }
  }

  clear(): void {
    this.contexts.clear()
  }
}
