import { describe, it, expect } from 'vitest';
import { escapeHtml, markdownToHtml, sanitizeHttpUrl } from '@/interface-adapters/views/dashboard/modules/html.js';

describe('escapeHtml', () => {
  it('should return empty string for null or undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should return plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('markdownToHtml', () => {
  it('should convert bold text', () => {
    const result = markdownToHtml('**bold**');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('should convert inline code', () => {
    const result = markdownToHtml('use `code` here');
    expect(result).toContain('<code>code</code>');
  });

  it('should convert headers', () => {
    expect(markdownToHtml('# Title')).toContain('<h1>Title</h1>');
    expect(markdownToHtml('## Subtitle')).toContain('<h2>Subtitle</h2>');
    expect(markdownToHtml('### Section')).toContain('<h3>Section</h3>');
  });

  it('should convert links', () => {
    const result = markdownToHtml('[click](https://example.com)');
    expect(result).toContain('<a href="https://example.com" target="_blank">click</a>');
  });

  it('should escape HTML in markdown input', () => {
    const result = markdownToHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
  });
});

describe('sanitizeHttpUrl', () => {
  it('should keep https URLs untouched', () => {
    expect(sanitizeHttpUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('should block non-http schemes', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBe('#');
  });

  it('should return fallback for invalid URLs', () => {
    expect(sanitizeHttpUrl('http://[::1')).toBe('#');
  });
});
