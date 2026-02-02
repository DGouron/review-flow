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
})
