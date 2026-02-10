import type { PidFileContent } from '../../shared/services/pidFileManager.js';

export function createPidFileContent(
  overrides?: Partial<PidFileContent>,
): PidFileContent {
  return {
    pid: 12345,
    startedAt: '2026-01-15T10:30:00.000Z',
    port: 3000,
    ...overrides,
  };
}
