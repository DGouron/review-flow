import { describe, it, expect } from 'vitest'
import {
  reviewContextThreadSchema,
  reviewContextProgressSchema,
  reviewContextSchema,
  createReviewContextInputSchema,
} from '../../../../entities/reviewContext/reviewContext.schema.js'

describe('reviewContextThreadSchema', () => {
  it('should validate a complete thread', () => {
    const thread = {
      id: 'PRRT_kwDONxxx',
      file: 'src/services/myService.ts',
      line: 42,
      status: 'open',
      body: 'Missing null check',
    }

    const result = reviewContextThreadSchema.safeParse(thread)

    expect(result.success).toBe(true)
  })

  it('should accept null for file and line (PR-level comment)', () => {
    const thread = {
      id: 'PRRT_kwDONxxx',
      file: null,
      line: null,
      status: 'resolved',
      body: 'General comment on PR',
    }

    const result = reviewContextThreadSchema.safeParse(thread)

    expect(result.success).toBe(true)
  })

  it('should reject invalid status', () => {
    const thread = {
      id: 'PRRT_kwDONxxx',
      file: 'src/file.ts',
      line: 10,
      status: 'pending',
      body: 'Comment',
    }

    const result = reviewContextThreadSchema.safeParse(thread)

    expect(result.success).toBe(false)
  })

  it('should reject missing required fields', () => {
    const thread = {
      id: 'PRRT_kwDONxxx',
      status: 'open',
    }

    const result = reviewContextThreadSchema.safeParse(thread)

    expect(result.success).toBe(false)
  })
})

describe('reviewContextProgressSchema', () => {
  it('should validate minimal progress', () => {
    const progress = {
      phase: 'pending',
      currentStep: null,
    }

    const result = reviewContextProgressSchema.safeParse(progress)

    expect(result.success).toBe(true)
  })

  it('should validate progress with all optional fields', () => {
    const progress = {
      phase: 'agents-running',
      currentStep: 'verify',
      stepsCompleted: ['context', 'scan'],
      updatedAt: '2026-02-02T10:00:00Z',
    }

    const result = reviewContextProgressSchema.safeParse(progress)

    expect(result.success).toBe(true)
  })

  it('should reject invalid phase', () => {
    const progress = {
      phase: 'invalid-phase',
      currentStep: null,
    }

    const result = reviewContextProgressSchema.safeParse(progress)

    expect(result.success).toBe(false)
  })

  it('should validate all valid phases', () => {
    const phases = ['pending', 'initializing', 'agents-running', 'synthesizing', 'publishing', 'completed']

    for (const phase of phases) {
      const result = reviewContextProgressSchema.safeParse({ phase, currentStep: null })
      expect(result.success).toBe(true)
    }
  })
})

describe('reviewContextSchema', () => {
  const validContext = {
    version: '1.0',
    mergeRequestId: 'github-owner/repo-42',
    platform: 'github',
    projectPath: 'owner/repo',
    mergeRequestNumber: 42,
    createdAt: '2026-02-02T10:00:00Z',
    threads: [],
    actions: [],
    progress: { phase: 'pending', currentStep: null },
  }

  it('should validate a complete context', () => {
    const result = reviewContextSchema.safeParse(validContext)

    expect(result.success).toBe(true)
  })

  it('should validate context with threads and actions', () => {
    const context = {
      ...validContext,
      threads: [
        { id: 'thread-1', file: 'src/file.ts', line: 10, status: 'open', body: 'Issue' },
      ],
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'thread-1' },
      ],
    }

    const result = reviewContextSchema.safeParse(context)

    expect(result.success).toBe(true)
  })

  it('should validate context with optional result', () => {
    const context = {
      ...validContext,
      result: {
        blocking: 0,
        warnings: 1,
        suggestions: 2,
        score: 9,
        verdict: 'ready_to_merge',
      },
    }

    const result = reviewContextSchema.safeParse(context)

    expect(result.success).toBe(true)
  })

  it('should reject invalid platform', () => {
    const context = {
      ...validContext,
      platform: 'bitbucket',
    }

    const result = reviewContextSchema.safeParse(context)

    expect(result.success).toBe(false)
  })

  it('should reject non-number mergeRequestNumber', () => {
    const context = {
      ...validContext,
      mergeRequestNumber: '42',
    }

    const result = reviewContextSchema.safeParse(context)

    expect(result.success).toBe(false)
  })
})

describe('createReviewContextInputSchema', () => {
  it('should validate minimal input', () => {
    const input = {
      localPath: '/home/user/project',
      mergeRequestId: 'github-owner/repo-42',
      platform: 'github',
      projectPath: 'owner/repo',
      mergeRequestNumber: 42,
    }

    const result = createReviewContextInputSchema.safeParse(input)

    expect(result.success).toBe(true)
  })

  it('should validate input with threads', () => {
    const input = {
      localPath: '/home/user/project',
      mergeRequestId: 'gitlab-group/project-10',
      platform: 'gitlab',
      projectPath: 'group/project',
      mergeRequestNumber: 10,
      threads: [
        { id: 'disc-123', file: 'src/main.ts', line: 5, status: 'open', body: 'Fix this' },
      ],
    }

    const result = createReviewContextInputSchema.safeParse(input)

    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const input = {
      localPath: '/home/user/project',
      platform: 'github',
    }

    const result = createReviewContextInputSchema.safeParse(input)

    expect(result.success).toBe(false)
  })
})
