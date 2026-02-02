import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ReviewContextGateway } from '../../entities/reviewContext/reviewContext.gateway.js'
import type {
  CreateReviewContextInput,
  CreateReviewContextResult,
  DeleteReviewContextResult,
  ReviewContext,
} from '../../entities/reviewContext/reviewContext.js'

export class ReviewContextFileSystemGateway implements ReviewContextGateway {
  getFilePath(localPath: string, mergeRequestId: string): string {
    return join(localPath, '.claude', 'reviews', 'logs', `${mergeRequestId}.json`)
  }

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const filePath = this.getFilePath(input.localPath, input.mergeRequestId)

    mkdirSync(dirname(filePath), { recursive: true })

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
      },
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
}
