import { describe, it, expect } from 'vitest'
import { normalizeGitUrl } from '@/frameworks/config/configLoader.js'

describe('normalizeGitUrl', () => {
  it('should convert SSH URL to HTTPS', () => {
    expect(normalizeGitUrl('git@gitlab.com:org/repo.git')).toBe('https://gitlab.com/org/repo')
  })

  it('should strip .git suffix from HTTPS URL', () => {
    expect(normalizeGitUrl('https://gitlab.com/org/repo.git')).toBe('https://gitlab.com/org/repo')
  })

  it('should leave HTTPS URL without .git unchanged', () => {
    expect(normalizeGitUrl('https://gitlab.com/org/repo')).toBe('https://gitlab.com/org/repo')
  })

  it('should handle SSH URL with nested groups', () => {
    expect(normalizeGitUrl('git@host:group/subgroup/repo.git')).toBe('https://host/group/subgroup/repo')
  })

  it('should pass through plain HTTPS URL without .git', () => {
    expect(normalizeGitUrl('https://github.com/owner/project')).toBe('https://github.com/owner/project')
  })
})
