import { describe, expect, it } from 'vitest';

import { SizeBlockListPresenter } from '@/modules/tracking/interface-adapters/presenters/sizeBlockList.presenter.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';

const presenter = new SizeBlockListPresenter();

describe('SizeBlockListPresenter', () => {
  it('reports an empty list when no entry has a size block', () => {
    const viewModel = presenter.present({ entries: [] });

    expect(viewModel.isEmpty).toBe(true);
    expect(viewModel.blocks).toEqual([]);
  });

  it('maps a blocked MR into a size block view model', () => {
    const mr = TrackedMrFactory.create({
      id: 'gitlab-group/a-1',
      mrNumber: 1,
      title: 'MR A',
      url: 'https://gitlab.com/group/a/-/merge_requests/1',
      platform: 'gitlab',
      sizeBlock: {
        countedLines: 2500,
        budget: 2000,
        message: 'trop gros',
        blockedAt: '2026-07-15T12:00:00.000Z',
      },
    });

    const viewModel = presenter.present({
      entries: [{ mr, projectName: 'Project A', projectPath: '/repo/a' }],
    });

    expect(viewModel.isEmpty).toBe(false);
    expect(viewModel.blocks).toEqual([
      {
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
      },
    ]);
  });

  it('skips entries whose sizeBlock is null', () => {
    const blocked = TrackedMrFactory.create({
      id: 'gitlab-group/a-1',
      sizeBlock: {
        countedLines: 2500,
        budget: 2000,
        message: 'trop gros',
        blockedAt: '2026-07-15T12:00:00.000Z',
      },
    });
    const unblocked = TrackedMrFactory.create({ id: 'gitlab-group/a-2', sizeBlock: null });

    const viewModel = presenter.present({
      entries: [
        { mr: blocked, projectName: 'Project A', projectPath: '/repo/a' },
        { mr: unblocked, projectName: 'Project A', projectPath: '/repo/a' },
      ],
    });

    expect(viewModel.blocks).toHaveLength(1);
    expect(viewModel.blocks[0]?.mrId).toBe('gitlab-group/a-1');
  });
});
