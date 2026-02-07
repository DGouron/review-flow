import { describe, it, expect } from 'vitest'
import { GitHubDiffMetadataFetchGateway } from '../../../../interface-adapters/gateways/diffMetadataFetch.github.gateway.js'
import { GitHubApiResponseFactory } from '../../../factories/githubApiResponse.factory.js'

describe('GitHubDiffMetadataFetchGateway', () => {
  describe('fetchDiffMetadata', () => {
    it('should parse base and head SHAs from GitHub PR API', () => {
      const stubExecutor = () => GitHubApiResponseFactory.createPullRequestResponse({
        base: { sha: 'base-sha-abc' },
        head: { sha: 'head-sha-def' },
      })

      const gateway = new GitHubDiffMetadataFetchGateway(stubExecutor)
      const result = gateway.fetchDiffMetadata('owner/repo', 42)

      expect(result.baseSha).toBe('base-sha-abc')
      expect(result.headSha).toBe('head-sha-def')
      expect(result.startSha).toBe('base-sha-abc')
    })

    it('should use base SHA as startSha since GitHub does not use start_sha', () => {
      const stubExecutor = () => GitHubApiResponseFactory.createPullRequestResponse({
        base: { sha: 'same-base' },
        head: { sha: 'some-head' },
      })

      const gateway = new GitHubDiffMetadataFetchGateway(stubExecutor)
      const result = gateway.fetchDiffMetadata('owner/repo', 10)

      expect(result.startSha).toBe(result.baseSha)
    })

    it('should call the correct GitHub API endpoint', () => {
      let capturedCommand = ''
      const stubExecutor = (command: string) => {
        capturedCommand = command
        return GitHubApiResponseFactory.createPullRequestResponse({
          base: { sha: 'a' },
          head: { sha: 'b' },
        })
      }

      const gateway = new GitHubDiffMetadataFetchGateway(stubExecutor)
      gateway.fetchDiffMetadata('owner/repo', 42)

      expect(capturedCommand).toContain('repos/owner/repo/pulls/42')
    })
  })
})
