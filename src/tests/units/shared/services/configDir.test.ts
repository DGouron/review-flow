import { describe, it, expect } from 'vitest';
import { getConfigDir } from '../../../../shared/services/configDir.js';

describe('getConfigDir', () => {
  it('should return a path ending with reviewflow', () => {
    const result = getConfigDir();

    expect(result).toMatch(/reviewflow$/);
  });

  it('should return an absolute path', () => {
    const result = getConfigDir();

    expect(result).toMatch(/^\//);
  });

  it('should use XDG_CONFIG_HOME when set', () => {
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = '/custom/config';

    try {
      const result = getConfigDir();
      expect(result).toBe('/custom/config/reviewflow');
    } finally {
      process.env.XDG_CONFIG_HOME = original ?? '';
    }
  });

  it('should fallback to ~/.config on linux when XDG_CONFIG_HOME is not set', () => {
    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = '';

    try {
      const result = getConfigDir();
      if (process.platform === 'linux') {
        expect(result).toContain('.config/reviewflow');
      }
    } finally {
      if (originalXdg !== undefined) {
        process.env.XDG_CONFIG_HOME = originalXdg;
      } else {
        process.env.XDG_CONFIG_HOME = '';
      }
    }
  });
});
