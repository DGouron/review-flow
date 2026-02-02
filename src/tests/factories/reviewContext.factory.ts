import type {
  ReviewContext,
  ReviewContextProgress,
  ReviewContextThread,
} from '../../entities/reviewContext/reviewContext.js'

export class ReviewContextFactory {
  static create(overrides?: Partial<ReviewContext>): ReviewContext {
    return {
      version: '1.0',
      mergeRequestId: 'github-owner-repo-42',
      platform: 'github',
      projectPath: 'owner/repo',
      mergeRequestNumber: 42,
      createdAt: '2026-02-02T10:00:00Z',
      threads: [],
      actions: [],
      progress: {
        phase: 'pending',
        currentStep: null,
      },
      ...overrides,
    }
  }

  static createWithProgress(progress: Partial<ReviewContextProgress>): ReviewContext {
    return this.create({
      progress: {
        phase: 'pending',
        currentStep: null,
        ...progress,
      },
    })
  }

  static createInProgress(currentStep: string, stepsCompleted: string[] = []): ReviewContext {
    return this.create({
      progress: {
        phase: 'agents-running',
        currentStep,
        stepsCompleted,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  static createCompleted(): ReviewContext {
    return this.create({
      progress: {
        phase: 'completed',
        currentStep: null,
        stepsCompleted: ['context', 'verify', 'scan', 'threads', 'report'],
        updatedAt: new Date().toISOString(),
      },
    })
  }

  static createThread(overrides?: Partial<ReviewContextThread>): ReviewContextThread {
    return {
      id: 'thread-1',
      file: 'src/index.ts',
      line: 42,
      status: 'open',
      body: 'Review comment',
      ...overrides,
    }
  }
}
