import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatStartupBanner } from '../../../cli/startupBanner.js';

describe('formatStartupBanner', () => {
  const originalNoColor = process.env.NO_COLOR;

  beforeEach(() => {
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  });

  it('should return dashboard URL', () => {
    const result = formatStartupBanner({ port: 3000, enabledPlatforms: [], daemonPid: null });

    expect(result.dashboardUrl).toBe('http://localhost:3000/dashboard/');
    expect(result.lines.some(line => line.includes('http://localhost:3000/dashboard/'))).toBe(true);
  });

  it('should include health URL', () => {
    const result = formatStartupBanner({ port: 3000, enabledPlatforms: [], daemonPid: null });

    expect(result.lines.some(line => line.includes('http://localhost:3000/health'))).toBe(true);
  });

  it('should include GitLab webhook URL when gitlab is enabled', () => {
    const result = formatStartupBanner({ port: 4000, enabledPlatforms: ['gitlab'], daemonPid: null });

    expect(result.lines.some(line => line.includes('http://localhost:4000/webhooks/gitlab'))).toBe(true);
  });

  it('should include GitHub webhook URL when github is enabled', () => {
    const result = formatStartupBanner({ port: 4000, enabledPlatforms: ['github'], daemonPid: null });

    expect(result.lines.some(line => line.includes('http://localhost:4000/webhooks/github'))).toBe(true);
  });

  it('should not include webhook URLs when no platforms are enabled', () => {
    const result = formatStartupBanner({ port: 3000, enabledPlatforms: [], daemonPid: null });

    expect(result.lines.some(line => line.includes('/webhooks/'))).toBe(false);
  });

  it('should include PID info in daemon mode', () => {
    const result = formatStartupBanner({ port: 3000, enabledPlatforms: [], daemonPid: 1234 });

    expect(result.lines.some(line => line.includes('1234'))).toBe(true);
  });

  it('should use the given port in all URLs', () => {
    const result = formatStartupBanner({ port: 8080, enabledPlatforms: ['gitlab'], daemonPid: null });

    expect(result.dashboardUrl).toBe('http://localhost:8080/dashboard/');
    expect(result.lines.every(line => !line.includes(':3000'))).toBe(true);
  });
});
