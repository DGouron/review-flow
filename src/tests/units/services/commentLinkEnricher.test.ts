import { describe, it, expect } from 'vitest'
import { enrichCommentWithLinks } from '../../../services/commentLinkEnricher.js'

const BASE_URL = 'https://gitlab.example.com'
const PROJECT_PATH = 'my-org/my-project'
const HEAD_SHA = 'abc123def456'

function enrich(body: string): string {
  return enrichCommentWithLinks(body, BASE_URL, PROJECT_PATH, HEAD_SHA)
}

describe('enrichCommentWithLinks', () => {
  it('should replace a simple file:line reference with a link', () => {
    const result = enrich('See file.py:42 for details')
    expect(result).toBe(
      'See [`file.py:42`](https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/file.py#L42) for details'
    )
  })

  it('should replace a backtick-wrapped file:line reference', () => {
    const result = enrich('Check `file.py:42` for the issue')
    expect(result).toBe(
      'Check [`file.py:42`](https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/file.py#L42) for the issue'
    )
  })

  it('should replace a parenthesized file:line reference', () => {
    const result = enrich('See issue (file.py:42)')
    expect(result).toBe(
      'See issue ([`file.py:42`](https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/file.py#L42))'
    )
  })

  it('should handle nested path references', () => {
    const result = enrich('Found at users/api.py:247')
    expect(result).toBe(
      'Found at [`users/api.py:247`](https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/users/api.py#L247)'
    )
  })

  it('should handle deeply nested paths', () => {
    const result = enrich('See src/components/posts/post-card.js:15')
    expect(result).toBe(
      'See [`src/components/posts/post-card.js:15`](https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/src/components/posts/post-card.js#L15)'
    )
  })

  it('should NOT match http:// URLs', () => {
    const body = 'Visit http://localhost:8000/api'
    expect(enrich(body)).toBe(body)
  })

  it('should NOT match https:// URLs', () => {
    const body = 'See https://example.com:443/path'
    expect(enrich(body)).toBe(body)
  })

  it('should NOT match filenames without line numbers', () => {
    const body = 'Edit docker-compose.yml for config'
    expect(enrich(body)).toBe(body)
  })

  it('should handle multiple references in the same body', () => {
    const result = enrich('Issues in file.py:10 and users/views.py:25 and lib/utils.py:100')
    expect(result).toContain('[`file.py:10`]')
    expect(result).toContain('[`users/views.py:25`]')
    expect(result).toContain('[`lib/utils.py:100`]')
  })

  it('should return body unchanged when all parameters are provided but no matches exist', () => {
    const body = 'No file references here, just plain text.'
    expect(enrich(body)).toBe(body)
  })

  it('should handle file references at start and end of body', () => {
    const result = enrich('file.py:1 is the start and end is file.py:99')
    expect(result).toContain('[`file.py:1`]')
    expect(result).toContain('[`file.py:99`]')
  })

  it('should handle references in markdown context', () => {
    const result = enrich('- **Blocking**: Missing validation in `users/api.py:247`')
    expect(result).toContain('[`users/api.py:247`]')
    expect(result).toContain('https://gitlab.example.com/my-org/my-project/-/blob/abc123def456/users/api.py#L247')
  })
})
