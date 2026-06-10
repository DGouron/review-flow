import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../frameworks/queue/pQueueAdapter.js', () => ({
  setProgressChangeCallback: vi.fn(),
  setStateChangeCallback: vi.fn(),
  updateJobProgress: vi.fn(),
  getJobsStatus: vi.fn(() => ({ active: [], recent: [] })),
}));

vi.mock('../../../frameworks/logging/logBuffer.js', () => ({
  onLog: vi.fn(),
}));

import {
  buildBudgetStatusMessage,
  buildBudgetExceededMessage,
  type BudgetExceededPayload,
} from '@/main/websocket.js';
import type { BudgetStatusViewModel } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';

describe('buildBudgetStatusMessage', () => {
  it('produces a JSON string with type=budget-status, the view model, and a timestamp', () => {
    const viewModel: BudgetStatusViewModel = {
      limitUsdFormatted: '$200.00',
      consumedUsdFormatted: '$50.00',
      remainingUsdFormatted: '$150.00',
      percentUsedFormatted: '25.00%',
      gaugeWidthPercent: 25,
      exceeded: false,
      periodStart: '2026-05-01T00:00:00.000Z',
    };

    const raw = buildBudgetStatusMessage(viewModel);
    const parsed = JSON.parse(raw) as {
      type: string;
      data: BudgetStatusViewModel;
      timestamp: string;
    };

    expect(parsed.type).toBe('budget-status');
    expect(parsed.data).toEqual(viewModel);
    expect(typeof parsed.timestamp).toBe('string');
  });
});

describe('buildBudgetExceededMessage', () => {
  it('produces a JSON string with type=budget-exceeded carrying the blocked job context', () => {
    const payload: BudgetExceededPayload = {
      mrNumber: 42,
      platform: 'gitlab',
      projectPath: 'group/project',
      limitUsd: 200,
      consumedUsd: 200.1,
    };

    const raw = buildBudgetExceededMessage(payload);
    const parsed = JSON.parse(raw) as {
      type: string;
      data: BudgetExceededPayload;
      timestamp: string;
    };

    expect(parsed.type).toBe('budget-exceeded');
    expect(parsed.data).toEqual(payload);
    expect(typeof parsed.timestamp).toBe('string');
  });
});
