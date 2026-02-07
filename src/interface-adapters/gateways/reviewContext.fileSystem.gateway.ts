import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ReviewContextGateway, UpdateResult } from '../../entities/reviewContext/reviewContext.gateway.js'
import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
  ReviewContextProgress,
} from '../../entities/reviewContext/reviewContext.js'
import { buildAgentInstructions } from '../../services/agentInstructionsBuilder.js'
import type { ReviewContextAction, ReviewContextResult } from '../../entities/reviewContext/reviewContextAction.schema.js'

export class ReviewContextFileSystemGateway implements ReviewContextGateway {
  getFilePath(localPath: string, mergeRequestId: string): string {
    return join(localPath, '.claude', 'reviews', 'logs', `${mergeRequestId}.json`)
  }

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const filePath = this.getFilePath(input.localPath, input.mergeRequestId)

    mkdirSync(dirname(filePath), { recursive: true })

    const agentInstructions = buildAgentInstructions(filePath)

    const content: ReviewContext = {
      version: '1.0',
      mergeRequestId: input.mergeRequestId,
      platform: input.platform,
      projectPath: input.projectPath,
      mergeRequestNumber: input.mergeRequestNumber,
      createdAt: new Date().toISOString(),
      threads: input.threads ?? [],
      actions: [],
      progress: {
        phase: 'pending',
        currentStep: null,
        ...(input.agents ? { agents: input.agents } : {}),
      },
      agentInstructions,
    }

    writeFileSync(filePath, JSON.stringify(content, null, 2))

    return { success: true, filePath }
  }

  delete(localPath: string, mergeRequestId: string): DeleteReviewContextResult {
    const filePath = this.getFilePath(localPath, mergeRequestId)

    if (!existsSync(filePath)) {
      return { success: true, deleted: false }
    }

    unlinkSync(filePath)
    return { success: true, deleted: true }
  }

  read(localPath: string, mergeRequestId: string): ReviewContext | null {
    const filePath = this.getFilePath(localPath, mergeRequestId)

    if (!existsSync(filePath)) {
      return null
    }

    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as ReviewContext
  }

  exists(localPath: string, mergeRequestId: string): boolean {
    const filePath = this.getFilePath(localPath, mergeRequestId)
    return existsSync(filePath)
  }

  appendAction(localPath: string, mergeRequestId: string, action: ReviewContextAction): UpdateResult {
    const context = this.read(localPath, mergeRequestId)
    if (!context) {
      return { success: false }
    }

    context.actions.push(action)
    const filePath = this.getFilePath(localPath, mergeRequestId)
    writeFileSync(filePath, JSON.stringify(context, null, 2))

    return { success: true }
  }

  updateProgress(localPath: string, mergeRequestId: string, progress: ReviewContextProgress): UpdateResult {
    const context = this.read(localPath, mergeRequestId)
    if (!context) {
      return { success: false }
    }

    context.progress = {
      ...progress,
      agents: progress.agents ?? context.progress.agents,
      updatedAt: new Date().toISOString(),
    }
    const filePath = this.getFilePath(localPath, mergeRequestId)
    writeFileSync(filePath, JSON.stringify(context, null, 2))

    return { success: true }
  }

  setResult(localPath: string, mergeRequestId: string, result: ReviewContextResult): UpdateResult {
    const context = this.read(localPath, mergeRequestId)
    if (!context) {
      return { success: false }
    }

    context.result = result
    const filePath = this.getFilePath(localPath, mergeRequestId)
    writeFileSync(filePath, JSON.stringify(context, null, 2))

    return { success: true }
  }
}
