import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { ReviewContextFileSystemGateway } from '../../../../interface-adapters/gateways/reviewContext.fileSystem.gateway.js'

describe('ReviewContextFileSystemGateway', () => {
  const testDir = '/tmp/test-review-context'
  let gateway: ReviewContextFileSystemGateway

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    gateway = new ReviewContextFileSystemGateway()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create a context file with basic merge request info', () => {
      const result = gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      expect(result.success).toBe(true)
      expect(existsSync(result.filePath)).toBe(true)

      const content = JSON.parse(readFileSync(result.filePath, 'utf-8'))
      expect(content.mergeRequestId).toBe('github-owner/repo-42')
      expect(content.platform).toBe('github')
      expect(content.projectPath).toBe('owner/repo')
      expect(content.mergeRequestNumber).toBe(42)
    })

    it('should create a context file with pre-injected threads', () => {
      const threads = [
        {
          id: 'PRRT_kwDONxxx123',
          file: 'src/services/mrTrackingService.ts',
          line: 320,
          status: 'open' as const,
          body: 'Missing test for threadsOpened = blocking only',
        },
        {
          id: 'PRRT_kwDONyyy456',
          file: 'src/utils/helper.ts',
          line: 42,
          status: 'open' as const,
          body: 'Consider using a guard here',
        },
      ]

      const result = gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
        threads,
      })

      const content = JSON.parse(readFileSync(result.filePath, 'utf-8'))
      expect(content.threads).toHaveLength(2)
      expect(content.threads[0].id).toBe('PRRT_kwDONxxx123')
      expect(content.threads[1].id).toBe('PRRT_kwDONyyy456')
    })
  })

  describe('delete', () => {
    it('should delete the context file and return deleted true', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      const result = gateway.delete(testDir, 'github-owner/repo-42')

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(true)
      expect(gateway.exists(testDir, 'github-owner/repo-42')).toBe(false)
    })

    it('should return deleted false when file does not exist', () => {
      const result = gateway.delete(testDir, 'github-nonexistent-99')

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(false)
    })
  })

  describe('appendAction', () => {
    it('should append a single action to the context file', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      const result = gateway.appendAction(testDir, 'github-owner/repo-42', {
        type: 'THREAD_RESOLVE',
        threadId: 'PRRT_kwDONxxx',
        message: 'Fixed - Added null check',
      })

      expect(result.success).toBe(true)

      const context = gateway.read(testDir, 'github-owner/repo-42')
      expect(context?.actions).toHaveLength(1)
      expect(context?.actions[0]).toEqual({
        type: 'THREAD_RESOLVE',
        threadId: 'PRRT_kwDONxxx',
        message: 'Fixed - Added null check',
      })
    })

    it('should append multiple actions preserving order', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      gateway.appendAction(testDir, 'github-owner/repo-42', {
        type: 'THREAD_RESOLVE',
        threadId: 'thread-1',
      })
      gateway.appendAction(testDir, 'github-owner/repo-42', {
        type: 'POST_COMMENT',
        body: 'Review complete',
      })
      gateway.appendAction(testDir, 'github-owner/repo-42', {
        type: 'ADD_LABEL',
        label: 'needs_approve',
      })

      const context = gateway.read(testDir, 'github-owner/repo-42')
      expect(context?.actions).toHaveLength(3)
      expect(context?.actions[0].type).toBe('THREAD_RESOLVE')
      expect(context?.actions[1].type).toBe('POST_COMMENT')
      expect(context?.actions[2].type).toBe('ADD_LABEL')
    })

    it('should return success false when context file does not exist', () => {
      const result = gateway.appendAction(testDir, 'github-nonexistent-99', {
        type: 'THREAD_RESOLVE',
        threadId: 'xxx',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('updateProgress', () => {
    it('should update progress phase and currentStep', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      const result = gateway.updateProgress(testDir, 'github-owner/repo-42', {
        phase: 'agents-running',
        currentStep: 'verify',
      })

      expect(result.success).toBe(true)

      const context = gateway.read(testDir, 'github-owner/repo-42')
      expect(context?.progress.phase).toBe('agents-running')
      expect(context?.progress.currentStep).toBe('verify')
    })

    it('should update stepsCompleted array', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      gateway.updateProgress(testDir, 'github-owner/repo-42', {
        phase: 'agents-running',
        currentStep: 'scan',
        stepsCompleted: ['context', 'verify'],
      })

      const context = gateway.read(testDir, 'github-owner/repo-42')
      expect(context?.progress.stepsCompleted).toEqual(['context', 'verify'])
    })

    it('should return success false when context file does not exist', () => {
      const result = gateway.updateProgress(testDir, 'github-nonexistent-99', {
        phase: 'completed',
        currentStep: null,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('setResult', () => {
    it('should set the review result', () => {
      gateway.create({
        localPath: testDir,
        mergeRequestId: 'github-owner/repo-42',
        platform: 'github',
        projectPath: 'owner/repo',
        mergeRequestNumber: 42,
      })

      const result = gateway.setResult(testDir, 'github-owner/repo-42', {
        blocking: 0,
        warnings: 2,
        suggestions: 3,
        score: 10,
        verdict: 'ready_to_merge',
      })

      expect(result.success).toBe(true)

      const context = gateway.read(testDir, 'github-owner/repo-42')
      expect(context?.result?.blocking).toBe(0)
      expect(context?.result?.verdict).toBe('ready_to_merge')
    })
  })
})
