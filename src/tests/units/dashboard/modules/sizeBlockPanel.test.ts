import { describe, expect, it, vi } from 'vitest';

import {
  buildSizeBlockPanelModel,
  fetchSizeBlocks,
  renderSizeBlockPanelHtml,
  triggerForceLaunch,
} from '@/dashboard/modules/sizeBlockPanel.js';
import type { SizeBlockViewModel } from '@/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.js';

function block(overrides: Partial<SizeBlockViewModel> = {}): SizeBlockViewModel {
  return {
    mrId: 'gitlab-group/a-1',
    mrNumber: 1,
    title: 'MR A',
    url: 'https://gitlab.com/group/a/-/merge_requests/1',
    platform: 'gitlab',
    projectName: 'Project A',
    projectPath: '/repo/a',
    countedLines: 2500,
    budget: 2000,
    blockedAt: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('sizeBlockPanel — buildSizeBlockPanelModel', () => {
  it('reports empty when there are no blocks', () => {
    const viewModel = buildSizeBlockPanelModel({ blocks: [], isEmpty: true });

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.count).toBe(0);
    expect(viewModel.rows).toEqual([]);
  });

  it('maps blocks into rows', () => {
    const viewModel = buildSizeBlockPanelModel({ blocks: [block()], isEmpty: false });

    expect(viewModel.isEmpty).toBe(false);
    expect(viewModel.count).toBe(1);
    expect(viewModel.rows[0].mrId).toBe('gitlab-group/a-1');
    expect(viewModel.rows[0].projectName).toBe('Project A');
  });
});

describe('sizeBlockPanel — renderSizeBlockPanelHtml', () => {
  it('renders nothing when the panel is empty', () => {
    const html = renderSizeBlockPanelHtml(buildSizeBlockPanelModel({ blocks: [], isEmpty: true }));

    expect(html).toBe('');
  });

  it('renders a force-launch button carrying the MR identity', () => {
    const html = renderSizeBlockPanelHtml(
      buildSizeBlockPanelModel({ blocks: [block()], isEmpty: false }),
    );

    expect(html).toContain('data-action="force-launch"');
    expect(html).toContain('data-mr-id="gitlab-group/a-1"');
    expect(html).toContain('data-project-path="/repo/a"');
    expect(html).toContain('Project A');
    expect(html).toContain('2500');
  });

  it('escapes the MR title', () => {
    const html = renderSizeBlockPanelHtml(
      buildSizeBlockPanelModel({ blocks: [block({ title: '<script>' })], isEmpty: false }),
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sizeBlockPanel — fetch helpers', () => {
  it('fetches the size-blocks payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ blocks: [block()], isEmpty: false }),
    });

    const payload = await fetchSizeBlocks(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/api/size-blocks');
    expect(payload.blocks).toHaveLength(1);
  });

  it('posts a force-launch request', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const result = await triggerForceLaunch(
      { mrId: 'gitlab-group/a-1', projectPath: '/repo/a' },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/mr-tracking/force-start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.success).toBe(true);
  });
});
