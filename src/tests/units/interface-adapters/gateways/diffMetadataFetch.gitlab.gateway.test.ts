import { describe, it, expect } from 'vitest'
import { GitLabDiffMetadataFetchGateway } from '../../../../interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js'
import { GitLabApiResponseFactory } from '../../../factories/gitlabApiResponse.factory.js'

describe('GitLabDiffMetadataFetchGateway', () => {
  describe('fetchDiffMetadata', () => {
    it('should parse the latest version SHAs from GitLab API', () => {
      const stubExecutor = () => GitLabApiResponseFactory.createVersionsResponse([
        {
          id: 1,
          base_commit_sha: 'base111',
          head_commit_sha: 'head111',
          start_commit_sha: 'start111',
        },
        {
          id: 2,
          base_commit_sha: 'base222',
          head_commit_sha: 'head222',
          start_commit_sha: 'start222',
        },
      ])

      const gateway = new GitLabDiffMetadataFetchGateway(stubExecutor)
      const result = gateway.fetchDiffMetadata('group/project', 99)

      expect(result.baseSha).toBe('base222')
      expect(result.headSha).toBe('head222')
      expect(result.startSha).toBe('start222')
    })

    it('should handle single version response', () => {
      const stubExecutor = () => GitLabApiResponseFactory.createVersionsResponse([
        {
          id: 1,
          base_commit_sha: 'abc123',
          head_commit_sha: 'def456',
          start_commit_sha: 'ghi789',
        },
      ])

      const gateway = new GitLabDiffMetadataFetchGateway(stubExecutor)
      const result = gateway.fetchDiffMetadata('my-group/my-project', 42)

      expect(result.baseSha).toBe('abc123')
      expect(result.headSha).toBe('def456')
      expect(result.startSha).toBe('ghi789')
    })

    it('should encode project path for API URL', () => {
      let capturedCommand = ''
      const stubExecutor = (command: string) => {
        capturedCommand = command
        return GitLabApiResponseFactory.createVersionsResponse([
          { id: 1, base_commit_sha: 'a', head_commit_sha: 'b', start_commit_sha: 'c' },
        ])
      }

      const gateway = new GitLabDiffMetadataFetchGateway(stubExecutor)
      gateway.fetchDiffMetadata('group/project', 99)

      expect(capturedCommand).toContain('group%2Fproject')
      expect(capturedCommand).toContain('merge_requests/99/versions')
    })
  })
})
