import { describe, expect, it } from 'vitest';

import {
  buildHeaderCapacityViewModel,
  renderHeaderCapacityBadgeHtml,
} from '@/dashboard/modules/headerCapacityBadge.js';

describe('headerCapacityBadge — buildHeaderCapacityViewModel', () => {
  it('builds a "running / total" label with isSaturated false when under load', () => {
    const viewModel = buildHeaderCapacityViewModel({ running: 3, max: 5 });

    expect(viewModel.runningCount).toBe(3);
    expect(viewModel.totalCapacity).toBe(5);
    expect(viewModel.label).toBe('3 / 5');
    expect(viewModel.isSaturated).toBe(false);
  });

  it('marks the viewmodel saturated when running equals max', () => {
    const viewModel = buildHeaderCapacityViewModel({ running: 5, max: 5 });

    expect(viewModel.label).toBe('5 / 5');
    expect(viewModel.isSaturated).toBe(true);
  });

  it('marks the viewmodel saturated when running exceeds max', () => {
    const viewModel = buildHeaderCapacityViewModel({ running: 7, max: 5 });

    expect(viewModel.label).toBe('7 / 5');
    expect(viewModel.isSaturated).toBe(true);
  });

  it('treats max of zero as not saturated even when running is zero', () => {
    const viewModel = buildHeaderCapacityViewModel({ running: 0, max: 0 });

    expect(viewModel.label).toBe('0 / 0');
    expect(viewModel.isSaturated).toBe(false);
  });

  it('coerces non-finite inputs to zero', () => {
    const viewModel = buildHeaderCapacityViewModel({
      running: Number.NaN,
      max: Number.POSITIVE_INFINITY,
    });

    expect(viewModel.runningCount).toBe(0);
    expect(viewModel.totalCapacity).toBe(0);
    expect(viewModel.label).toBe('0 / 0');
    expect(viewModel.isSaturated).toBe(false);
  });
});

describe('headerCapacityBadge — renderHeaderCapacityBadgeHtml', () => {
  it('renders a span with the badge id and the formatted label', () => {
    const html = renderHeaderCapacityBadgeHtml(
      buildHeaderCapacityViewModel({ running: 2, max: 4 }),
    );

    expect(html).toContain('id="header-capacity-badge"');
    expect(html).toContain('// CAP 2 / 4');
    expect(html).toContain('header-capacity-badge');
    expect(html).not.toContain('header-capacity-badge--saturated');
  });

  it('adds the saturated modifier class when capacity is fully used', () => {
    const html = renderHeaderCapacityBadgeHtml(
      buildHeaderCapacityViewModel({ running: 4, max: 4 }),
    );

    expect(html).toContain('header-capacity-badge--saturated');
    expect(html).toContain('// CAP 4 / 4');
  });

  it('escapes the title attribute content', () => {
    const html = renderHeaderCapacityBadgeHtml(
      buildHeaderCapacityViewModel({ running: 1, max: 2 }),
    );

    expect(html).toMatch(/title="[^"]*Reviews en cours[^"]*"/);
  });
});
