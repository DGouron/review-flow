import { describe, it, expect } from 'vitest'
import { extractBaseUrl } from '@/interface-adapters/controllers/webhook/gitlab.controller.js'

describe('extractBaseUrl', () => {
  it('should extract protocol://host from HTTPS URL', () => {
    expect(extractBaseUrl('https://gitlab.example.com/group/project.git')).toBe('https://gitlab.example.com')
  })

  it('should extract protocol://host from HTTP URL', () => {
    expect(extractBaseUrl('http://gitlab.example.com/group/project.git')).toBe('http://gitlab.example.com')
  })

  it('should convert SSH URL to https://host', () => {
    expect(extractBaseUrl('git@gitlab.example.com:group/project.git')).toBe('https://gitlab.example.com')
  })

  it('should preserve port in HTTPS URL', () => {
    expect(extractBaseUrl('https://gitlab.example.com:8443/group/project.git')).toBe('https://gitlab.example.com:8443')
  })

  it('should extract host from SSH URL with nested groups', () => {
    expect(extractBaseUrl('git@gitlab.example.com:group/subgroup/project.git')).toBe('https://gitlab.example.com')
  })

  it('should return null for empty string', () => {
    expect(extractBaseUrl('')).toBeNull()
  })

  it('should return null for invalid URL', () => {
    expect(extractBaseUrl('not-a-url')).toBeNull()
  })
})
