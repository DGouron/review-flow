import { describe, it, expect } from 'vitest'
import { GitHubThreadFetchGateway } from '../../../../interface-adapters/gateways/threadFetch.github.gateway.js'
import { GitHubApiResponseFactory } from '../../../factories/githubApiResponse.factory.js'

describe('GitHubThreadFetchGateway', () => {
  describe('fetchThreads', () => {
    it('should fetch threads with full metadata from GitHub API', () => {
      const stubExecutor = () => GitHubApiResponseFactory.createReviewThreadsResponse([
        {
          id: 'PRRT_kwDONxxx123',
          isResolved: false,
          path: 'src/services/mrTrackingService.ts',
          line: 320,
          body: 'Missing test for threadsOpened',
        }
      ])

      const gateway = new GitHubThreadFetchGateway(stubExecutor)
      const threads = gateway.fetchThreads('owner/repo', 42)

      expect(threads).toHaveLength(1)
      expect(threads[0].id).toBe('PRRT_kwDONxxx123')
      expect(threads[0].file).toBe('src/services/mrTrackingService.ts')
      expect(threads[0].line).toBe(320)
      expect(threads[0].status).toBe('open')
      expect(threads[0].body).toBe('Missing test for threadsOpened')
    })

    it('should mark resolved threads with status resolved', () => {
      const stubExecutor = () => GitHubApiResponseFactory.createReviewThreadsResponse([
        {
          id: 'PRRT_resolved',
          isResolved: true,
          path: 'src/file.ts',
          line: 10,
          body: 'Fixed issue',
        }
      ])

      const gateway = new GitHubThreadFetchGateway(stubExecutor)
      const threads = gateway.fetchThreads('owner/repo', 42)

      expect(threads[0].status).toBe('resolved')
    })
  })
})
