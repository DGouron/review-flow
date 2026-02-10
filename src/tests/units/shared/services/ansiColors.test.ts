import { describe, it, expect, vi, afterEach } from 'vitest';

describe('ansiColors', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadColors() {
    return import('../../../../shared/services/ansiColors.js');
  }

  describe('when colors are enabled', () => {
    it('should wrap text with red ANSI code', async () => {
      vi.stubEnv('NO_COLOR', '');
      const { red } = await loadColors();

      expect(red('error')).toBe('\x1b[31merror\x1b[0m');
    });

    it('should wrap text with green ANSI code', async () => {
      vi.stubEnv('NO_COLOR', '');
      const { green } = await loadColors();

      expect(green('success')).toBe('\x1b[32msuccess\x1b[0m');
    });

    it('should wrap text with yellow ANSI code', async () => {
      vi.stubEnv('NO_COLOR', '');
      const { yellow } = await loadColors();

      expect(yellow('warning')).toBe('\x1b[33mwarning\x1b[0m');
    });

    it('should wrap text with dim ANSI code', async () => {
      vi.stubEnv('NO_COLOR', '');
      const { dim } = await loadColors();

      expect(dim('subtle')).toBe('\x1b[2msubtle\x1b[0m');
    });

    it('should wrap text with bold ANSI code', async () => {
      vi.stubEnv('NO_COLOR', '');
      const { bold } = await loadColors();

      expect(bold('important')).toBe('\x1b[1mimportant\x1b[0m');
    });
  });

  describe('when NO_COLOR is set', () => {
    it('should return plain text without ANSI codes', async () => {
      vi.stubEnv('NO_COLOR', '1');
      const { red, green, yellow, dim, bold } = await loadColors();

      expect(red('error')).toBe('error');
      expect(green('success')).toBe('success');
      expect(yellow('warning')).toBe('warning');
      expect(dim('subtle')).toBe('subtle');
      expect(bold('important')).toBe('important');
    });
  });
});
