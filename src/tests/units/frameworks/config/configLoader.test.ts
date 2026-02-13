import { validateAndEnrichConfig } from '../../../../frameworks/config/configLoader.js'

function createValidConfig(userOverrides: Record<string, unknown> = {}) {
  return {
    server: { port: 3000 },
    user: {
      gitlabUsername: 'my-gitlab-user',
      githubUsername: 'my-github-user',
      ...userOverrides,
    },
    queue: { maxConcurrent: 2, deduplicationWindowMs: 5000 },
    repositories: [],
  }
}

describe('validateAndEnrichConfig', () => {
  describe('username validation', () => {
    it('should accept both non-empty usernames', () => {
      const config = createValidConfig()

      const result = validateAndEnrichConfig(config)

      expect(result.user.gitlabUsername).toBe('my-gitlab-user')
      expect(result.user.githubUsername).toBe('my-github-user')
    })

    it('should accept empty gitlabUsername with non-empty githubUsername', () => {
      const config = createValidConfig({
        gitlabUsername: '',
        githubUsername: 'my-github-user',
      })

      const result = validateAndEnrichConfig(config)

      expect(result.user.gitlabUsername).toBe('')
      expect(result.user.githubUsername).toBe('my-github-user')
    })

    it('should accept empty githubUsername with non-empty gitlabUsername', () => {
      const config = createValidConfig({
        gitlabUsername: 'my-gitlab-user',
        githubUsername: '',
      })

      const result = validateAndEnrichConfig(config)

      expect(result.user.gitlabUsername).toBe('my-gitlab-user')
      expect(result.user.githubUsername).toBe('')
    })

    it('should accept both usernames empty', () => {
      const config = createValidConfig({
        gitlabUsername: '',
        githubUsername: '',
      })

      const result = validateAndEnrichConfig(config)

      expect(result.user.gitlabUsername).toBe('')
      expect(result.user.githubUsername).toBe('')
    })

    it('should reject non-string gitlabUsername', () => {
      const config = createValidConfig({ gitlabUsername: 123 })

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'gitlabUsername',
      )
    })

    it('should reject missing gitlabUsername field', () => {
      const config = createValidConfig()
      ;(config.user as Record<string, unknown>).gitlabUsername = undefined

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'gitlabUsername',
      )
    })

    it('should reject non-string githubUsername', () => {
      const config = createValidConfig({ githubUsername: true })

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'githubUsername',
      )
    })

    it('should reject missing githubUsername field', () => {
      const config = createValidConfig()
      ;(config.user as Record<string, unknown>).githubUsername = undefined

      expect(() => validateAndEnrichConfig(config)).toThrow(
        'githubUsername',
      )
    })
  })
})
