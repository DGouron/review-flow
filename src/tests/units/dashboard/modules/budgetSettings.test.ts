import { describe, it, expect, vi } from 'vitest';

import {
  renderBudgetTile,
  parseBudgetStatusMessage,
  parseBudgetExceededMessage,
  fetchBudget,
  fetchBudgetStatus,
  submitBudget,
} from '@/dashboard/modules/budgetSettings.js';

const viewModel = {
  limitUsdFormatted: '$200.00',
  consumedUsdFormatted: '$48.50',
  remainingUsdFormatted: '$151.50',
  percentUsedFormatted: '24.25%',
  gaugeWidthPercent: 24.25,
  exceeded: false,
  periodStart: '2026-05-01T00:00:00.000Z',
};

describe('renderBudgetTile', () => {
  it('renders the formatted limit, consumed and remaining values', () => {
    const html = renderBudgetTile(viewModel);
    expect(html).toContain('$200.00');
    expect(html).toContain('$48.50');
    expect(html).toContain('$151.50');
  });

  it('renders the gauge width as a CSS percentage', () => {
    const html = renderBudgetTile(viewModel);
    expect(html).toContain('24.25%');
  });

  it('renders an exceeded badge when exceeded=true', () => {
    const html = renderBudgetTile({ ...viewModel, exceeded: true });
    expect(html.toLowerCase()).toContain('exceeded');
  });
});

describe('parseBudgetStatusMessage', () => {
  it('returns the view model when type is budget-status', () => {
    const parsed = parseBudgetStatusMessage({
      type: 'budget-status',
      data: viewModel,
      timestamp: '2026-05-15T00:00:00.000Z',
    });
    expect(parsed).toEqual(viewModel);
  });

  it('returns null when type is not budget-status', () => {
    expect(parseBudgetStatusMessage({ type: 'progress' })).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(parseBudgetStatusMessage({ type: 'budget-status' })).toBeNull();
  });
});

describe('parseBudgetExceededMessage', () => {
  it('extracts mrNumber, platform, projectPath, limitUsd, consumedUsd', () => {
    const parsed = parseBudgetExceededMessage({
      type: 'budget-exceeded',
      data: {
        mrNumber: 42,
        platform: 'gitlab',
        projectPath: 'group/project',
        limitUsd: 200,
        consumedUsd: 200.1,
      },
    });
    expect(parsed).toEqual({
      mrNumber: 42,
      platform: 'gitlab',
      projectPath: 'group/project',
      limitUsd: 200,
      consumedUsd: 200.1,
    });
  });

  it('returns null when type is not budget-exceeded', () => {
    expect(parseBudgetExceededMessage({ type: 'budget-status' })).toBeNull();
  });
});

describe('fetchBudget', () => {
  it('GETs /api/budget and returns the parsed body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ limitUsd: 200 }) }));
    const result = await fetchBudget(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith('/api/budget');
    expect(result).toEqual({ limitUsd: 200 });
  });
});

describe('fetchBudgetStatus', () => {
  it('GETs /api/budget/status and returns the parsed body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => viewModel }));
    const result = await fetchBudgetStatus(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith('/api/budget/status');
    expect(result).toEqual(viewModel);
  });
});

describe('submitBudget', () => {
  it('POSTs /api/budget with limitUsd and returns the parsed body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, limitUsd: 350 }),
    }));
    const result = await submitBudget(350, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/budget',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ limitUsd: 350 }),
      }),
    );
    expect(result).toEqual({ success: true, limitUsd: 350 });
  });
});
