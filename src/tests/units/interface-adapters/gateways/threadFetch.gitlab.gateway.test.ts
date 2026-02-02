import { describe, it, expect } from 'vitest'
import { GitLabThreadFetchGateway } from '../../../../interface-adapters/gateways/threadFetch.gitlab.gateway.js'
import { GitLabApiResponseFactory } from '../../../factories/gitlabApiResponse.factory.js'

describe('GitLabThreadFetchGateway', () => {
  describe('fetchThreads', () => {
    it('should fetch threads with full metadata from GitLab API', () => {
      const stubExecutor = () => GitLabApiResponseFactory.createDiscussionsResponse([
        {
          id: 'abc123def',
          notes: [{
            resolvable: true,
            resolved: false,
            body: 'Missing validation',
            position: {
              new_path: 'src/services/service.ts',
              new_line: 42,
            }
          }]
        }
      ])

      const gateway = new GitLabThreadFetchGateway(stubExecutor)
      const threads = gateway.fetchThreads('group/project', 99)

      expect(threads).toHaveLength(1)
      expect(threads[0].id).toBe('abc123def')
      expect(threads[0].file).toBe('src/services/service.ts')
      expect(threads[0].line).toBe(42)
      expect(threads[0].status).toBe('open')
    })
  })
})
