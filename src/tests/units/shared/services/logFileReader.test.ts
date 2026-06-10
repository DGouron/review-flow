import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { logFileExists, readLastLines, watchLogFile } from '@/shared/services/logFileReader.js';

describe('logFileReader', () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'log-reader-'));
    logPath = join(dir, 'app.log');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('logFileExists', () => {
    it('is false when the file is absent', () => {
      expect(logFileExists(logPath)).toBe(false);
    });

    it('is true once the file exists', () => {
      writeFileSync(logPath, 'line\n');
      expect(logFileExists(logPath)).toBe(true);
    });
  });

  describe('readLastLines', () => {
    it('returns an empty array when the file is absent', () => {
      expect(readLastLines(logPath, 10)).toEqual([]);
    });

    it('returns the last N non-empty lines', () => {
      writeFileSync(logPath, 'a\nb\n\n  \nc\nd\n');
      expect(readLastLines(logPath, 2)).toEqual(['c', 'd']);
    });
  });

  describe('watchLogFile', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits appended lines on each poll and stops cleanly', () => {
      writeFileSync(logPath, 'initial\n');
      const received: string[] = [];
      const watcher = watchLogFile(logPath, (line) => received.push(line));

      appendFileSync(logPath, 'fresh-1\nfresh-2\n');
      vi.advanceTimersByTime(500);

      expect(received).toEqual(['fresh-1', 'fresh-2']);

      watcher.stop();
      appendFileSync(logPath, 'after-stop\n');
      vi.advanceTimersByTime(500);
      expect(received).toEqual(['fresh-1', 'fresh-2']);
    });

    it('does not emit when the file has not grown', () => {
      writeFileSync(logPath, 'initial\n');
      const received: string[] = [];
      const watcher = watchLogFile(logPath, (line) => received.push(line));

      vi.advanceTimersByTime(500);

      expect(received).toEqual([]);
      watcher.stop();
    });

    it('ignores polls while the file is absent', () => {
      const received: string[] = [];
      const watcher = watchLogFile(logPath, (line) => received.push(line));

      vi.advanceTimersByTime(500);

      expect(received).toEqual([]);
      watcher.stop();
    });
  });
});
