import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveClaudePath,
  clearClaudePathCache,
} from '../../../../shared/services/claudePathResolver.js';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');

describe('resolveClaudePath', () => {
  beforeEach(() => {
    clearClaudePathCache();
    vi.resetAllMocks();
  });

  it('should return path from which when available', () => {
    const expectedPath = '/home/user/.nvm/versions/node/v22.0.0/bin/claude';
    vi.mocked(childProcess.execSync).mockReturnValue(expectedPath + '\n');
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = resolveClaudePath();

    expect(result).toBe(expectedPath);
  });

  it('should fallback to nvm path when which fails', () => {
    const nvmPath = '/home/user/.nvm/versions/node/v22.14.0/bin/claude';
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('which: no claude in PATH');
    });
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === nvmPath;
    });
    // @ts-expect-error - mock returns string[] but type expects Dirent[]
    vi.mocked(fs.readdirSync).mockReturnValue(['v22.14.0']);

    const result = resolveClaudePath();

    expect(result).toBe(nvmPath);
  });

  it('should fallback to common paths when which and nvm fail', () => {
    const commonPath = '/usr/local/bin/claude';
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('which: no claude in PATH');
    });
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === commonPath;
    });

    const result = resolveClaudePath();

    expect(result).toBe(commonPath);
  });

  it('should cache the resolved path and not search again', () => {
    const expectedPath = '/home/user/.nvm/versions/node/v22.0.0/bin/claude';
    vi.mocked(childProcess.execSync).mockReturnValue(expectedPath + '\n');
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const firstResult = resolveClaudePath();
    const secondResult = resolveClaudePath();

    expect(firstResult).toBe(expectedPath);
    expect(secondResult).toBe(expectedPath);
    expect(childProcess.execSync).toHaveBeenCalledTimes(1);
  });
});
