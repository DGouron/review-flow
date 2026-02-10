import { describe, it, expect, vi } from 'vitest';
import {
  readPidFile,
  writePidFile,
  removePidFile,
  pidFileExists,
  type PidFileManagerDependencies,
} from '../../../../shared/services/pidFileManager.js';
import { createPidFileContent } from '../../../factories/pidFileContent.factory.js';

function createFakeDeps(
  overrides?: Partial<PidFileManagerDependencies>,
): PidFileManagerDependencies {
  return {
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    ...overrides,
  };
}

describe('pidFileManager', () => {
  const pidPath = '/home/user/.config/reviewflow/reviewflow.pid';

  describe('readPidFile', () => {
    it('should return parsed PID file content when file exists', () => {
      const content = createPidFileContent({ pid: 999, port: 4000 });
      const deps = createFakeDeps({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify(content)),
      });

      const result = readPidFile(pidPath, deps);

      expect(result).toEqual(content);
      expect(deps.readFileSync).toHaveBeenCalledWith(pidPath, 'utf-8');
    });

    it('should return null when file does not exist', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => false),
      });

      const result = readPidFile(pidPath, deps);

      expect(result).toBeNull();
    });

    it('should return null when file contains invalid JSON', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => 'not json'),
      });

      const result = readPidFile(pidPath, deps);

      expect(result).toBeNull();
    });
  });

  describe('writePidFile', () => {
    it('should create directory and write JSON content', () => {
      const content = createPidFileContent();
      const deps = createFakeDeps();

      writePidFile(pidPath, content, deps);

      expect(deps.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.config/reviewflow'),
        { recursive: true },
      );
      expect(deps.writeFileSync).toHaveBeenCalledWith(
        pidPath,
        JSON.stringify(content, null, 2),
      );
    });
  });

  describe('removePidFile', () => {
    it('should delete the PID file when it exists', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => true),
      });

      removePidFile(pidPath, deps);

      expect(deps.unlinkSync).toHaveBeenCalledWith(pidPath);
    });

    it('should do nothing when file does not exist', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => false),
      });

      removePidFile(pidPath, deps);

      expect(deps.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('pidFileExists', () => {
    it('should return true when file exists', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => true),
      });

      expect(pidFileExists(pidPath, deps)).toBe(true);
    });

    it('should return false when file does not exist', () => {
      const deps = createFakeDeps({
        existsSync: vi.fn(() => false),
      });

      expect(pidFileExists(pidPath, deps)).toBe(false);
    });
  });
});
