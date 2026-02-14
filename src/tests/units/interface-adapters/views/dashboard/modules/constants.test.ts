import { describe, it, expect } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  STORAGE_KEY_PROJECTS,
  STORAGE_KEY_CURRENT,
} from '@/interface-adapters/views/dashboard/modules/constants.js';

describe('constants', () => {
  it('should export reconnection settings', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(10);
    expect(RECONNECT_DELAY).toBe(3000);
  });

  it('should export localStorage keys', () => {
    expect(STORAGE_KEY_PROJECTS).toBe('review-flow-projects');
    expect(STORAGE_KEY_CURRENT).toBe('review-flow-current-project');
  });
});
