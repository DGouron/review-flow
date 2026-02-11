import { describe, it, expect, vi } from 'vitest';
import { openInBrowser } from '../../../../shared/services/browserOpener.js';

describe('openInBrowser', () => {
  it('should call xdg-open on linux', () => {
    const execSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'linux', execSync });

    expect(execSync).toHaveBeenCalledWith('xdg-open "http://localhost:3000"');
  });

  it('should call open on darwin', () => {
    const execSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'darwin', execSync });

    expect(execSync).toHaveBeenCalledWith('open "http://localhost:3000"');
  });

  it('should call start on win32', () => {
    const execSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'win32', execSync });

    expect(execSync).toHaveBeenCalledWith('start "http://localhost:3000"');
  });

  it('should not throw on unsupported platform', () => {
    const execSync = vi.fn();

    expect(() => openInBrowser('http://localhost:3000', { platform: 'freebsd', execSync })).not.toThrow();
    expect(execSync).not.toHaveBeenCalled();
  });

  it('should not throw when command fails', () => {
    const execSync = vi.fn(() => { throw new Error('command not found'); });

    expect(() => openInBrowser('http://localhost:3000', { platform: 'linux', execSync })).not.toThrow();
  });
});
