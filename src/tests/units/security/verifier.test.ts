import { vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { createFastifyRequestStub } from '../../stubs/fastifyRequest.stub.js'

const TEST_GITLAB_TOKEN = 'gitlab-secret-token-123'
const TEST_GITHUB_SECRET = 'github-webhook-secret-456'

vi.mock('../../../config/loader.js', () => ({
  loadEnvSecrets: vi.fn(() => ({
    gitlabWebhookToken: TEST_GITLAB_TOKEN,
    githubWebhookSecret: TEST_GITHUB_SECRET,
  })),
}))

import {
  verifyGitLabSignature,
  verifyGitHubSignature,
  getGitLabEventType,
  getGitHubEventType,
} from '../../../security/verifier.js'

describe('verifyGitLabSignature', () => {
  describe('when token is valid', () => {
    it('should return valid: true', () => {
      const request = createFastifyRequestStub({
        headers: {
          'x-gitlab-token': TEST_GITLAB_TOKEN,
        },
      })

      const result = verifyGitLabSignature(request)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('when token is invalid', () => {
    it('should return valid: false with error', () => {
      const request = createFastifyRequestStub({
        headers: {
          'x-gitlab-token': 'wrong-token',
        },
      })

      const result = verifyGitLabSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalide')
    })
  })

  describe('when token header is missing', () => {
    it('should return valid: false with missing error', () => {
      const request = createFastifyRequestStub({
        headers: {},
      })

      const result = verifyGitLabSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('manquant')
    })
  })

  describe('when token is empty string', () => {
    it('should return valid: false', () => {
      const request = createFastifyRequestStub({
        headers: {
          'x-gitlab-token': '',
        },
      })

      const result = verifyGitLabSignature(request)

      expect(result.valid).toBe(false)
    })
  })

  describe('when token has different length', () => {
    it('should return valid: false without timing leak', () => {
      const request = createFastifyRequestStub({
        headers: {
          'x-gitlab-token': 'short',
        },
      })

      const result = verifyGitLabSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalide')
    })
  })
})

describe('verifyGitHubSignature', () => {
  function computeHmac(body: string, secret: string): string {
    const hmac = createHmac('sha256', secret)
    hmac.update(Buffer.from(body))
    return `sha256=${hmac.digest('hex')}`
  }

  describe('when signature is valid', () => {
    it('should return valid: true', () => {
      const body = '{"test": true}'
      const signature = computeHmac(body, TEST_GITHUB_SECRET)

      const request = createFastifyRequestStub({
        headers: {
          'x-hub-signature-256': signature,
        },
        rawBody: body,
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('when signature is invalid', () => {
    it('should return valid: false with error', () => {
      const body = '{"test": true}'
      const wrongSignature = computeHmac(body, 'wrong-secret')

      const request = createFastifyRequestStub({
        headers: {
          'x-hub-signature-256': wrongSignature,
        },
        rawBody: body,
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalide')
    })
  })

  describe('when signature header is missing', () => {
    it('should return valid: false with missing error', () => {
      const request = createFastifyRequestStub({
        headers: {},
        rawBody: '{"test": true}',
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('manquant')
    })
  })

  describe('when rawBody is missing', () => {
    it('should return valid: false with body error', () => {
      const signature = computeHmac('{}', TEST_GITHUB_SECRET)

      const request = createFastifyRequestStub({
        headers: {
          'x-hub-signature-256': signature,
        },
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Corps')
    })
  })

  describe('when body content differs', () => {
    it('should return valid: false', () => {
      const originalBody = '{"original": true}'
      const tamperedBody = '{"tampered": true}'
      const signature = computeHmac(originalBody, TEST_GITHUB_SECRET)

      const request = createFastifyRequestStub({
        headers: {
          'x-hub-signature-256': signature,
        },
        rawBody: tamperedBody,
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(false)
    })
  })

  describe('when signature has wrong format', () => {
    it('should return valid: false for missing prefix', () => {
      const body = '{"test": true}'
      const hmac = createHmac('sha256', TEST_GITHUB_SECRET)
      hmac.update(Buffer.from(body))
      const signatureWithoutPrefix = hmac.digest('hex')

      const request = createFastifyRequestStub({
        headers: {
          'x-hub-signature-256': signatureWithoutPrefix,
        },
        rawBody: body,
      })

      const result = verifyGitHubSignature(request)

      expect(result.valid).toBe(false)
    })
  })
})

describe('getGitLabEventType', () => {
  it('should extract event type from header', () => {
    const request = createFastifyRequestStub({
      headers: {
        'x-gitlab-event': 'Merge Request Hook',
      },
    })

    const result = getGitLabEventType(request)

    expect(result).toBe('Merge Request Hook')
  })

  it('should return undefined when header is missing', () => {
    const request = createFastifyRequestStub({
      headers: {},
    })

    const result = getGitLabEventType(request)

    expect(result).toBeUndefined()
  })
})

describe('getGitHubEventType', () => {
  it('should extract event type from header', () => {
    const request = createFastifyRequestStub({
      headers: {
        'x-github-event': 'pull_request',
      },
    })

    const result = getGitHubEventType(request)

    expect(result).toBe('pull_request')
  })

  it('should return undefined when header is missing', () => {
    const request = createFastifyRequestStub({
      headers: {},
    })

    const result = getGitHubEventType(request)

    expect(result).toBeUndefined()
  })
})
