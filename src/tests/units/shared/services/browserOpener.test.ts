import { describe, it, expect, vi } from 'vitest';
import { openInBrowser } from '../../../../shared/services/browserOpener.js';

describe('openInBrowser', () => {
  it('should call xdg-open on linux', () => {
    const execFileSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'linux', execFileSync });

    expect(execFileSync).toHaveBeenCalledWith('xdg-open', ['http://localhost:3000']);
  });

  it('should call open on darwin', () => {
    const execFileSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'darwin', execFileSync });

    expect(execFileSync).toHaveBeenCalledWith('open', ['http://localhost:3000']);
  });

  it('should call start on win32', () => {
    const execFileSync = vi.fn();
    openInBrowser('http://localhost:3000', { platform: 'win32', execFileSync });

    expect(execFileSync).toHaveBeenCalledWith('start', ['http://localhost:3000']);
  });

  it('should not throw on unsupported platform', () => {
    const execFileSync = vi.fn();

    expect(() => openInBrowser('http://localhost:3000', { platform: 'freebsd', execFileSync })).not.toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('should not throw when command fails', () => {
    const execFileSync = vi.fn(() => { throw new Error('command not found'); });

    expect(() => openInBrowser('http://localhost:3000', { platform: 'linux', execFileSync })).not.toThrow();
  });
});
