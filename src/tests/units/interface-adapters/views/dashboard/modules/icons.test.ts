import { describe, it, expect } from 'vitest';
import { getAgentIcon, icon } from '@/interface-adapters/views/dashboard/modules/icons.js';

describe('getAgentIcon', () => {
  it('should return clock icon for pending status', () => {
    expect(getAgentIcon('pending')).toBe('<i data-lucide="clock"></i>');
  });

  it('should return loader icon for running status', () => {
    expect(getAgentIcon('running')).toBe('<i data-lucide="loader"></i>');
  });

  it('should return check icon for completed status', () => {
    expect(getAgentIcon('completed')).toBe('<i data-lucide="check"></i>');
  });

  it('should return x icon for failed status', () => {
    expect(getAgentIcon('failed')).toBe('<i data-lucide="x"></i>');
  });

  it('should return help-circle icon for unknown status', () => {
    expect(getAgentIcon('unknown')).toBe('<i data-lucide="help-circle"></i>');
  });
});

describe('icon', () => {
  it('should return lucide icon markup', () => {
    expect(icon('clock')).toBe('<i data-lucide="clock" class=""></i>');
  });

  it('should include className when provided', () => {
    expect(icon('star', 'active')).toBe('<i data-lucide="star" class="active"></i>');
  });
});
