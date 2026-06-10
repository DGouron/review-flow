import { describe, it, expect } from 'vitest';

import { EmberStatusPresenter } from '@/modules/ember-chat/interface-adapters/presenters/emberStatus.presenter.js';

const presenter = new EmberStatusPresenter();

describe('EmberStatusPresenter', () => {
  it('maps the working status to the working avatar state with a French announcement', () => {
    const viewModel = presenter.present({ kind: 'status', status: 'working' });

    expect(viewModel.avatarState).toBe('working');
    expect(viewModel.liveRegionText).toContain('Ember');
    expect(viewModel.unavailableMessage).toBeNull();
  });

  it('maps the idle status to the idle avatar state', () => {
    const viewModel = presenter.present({ kind: 'status', status: 'idle' });

    expect(viewModel.avatarState).toBe('idle');
  });

  it('announces the answer text on a chunk-complete event', () => {
    const viewModel = presenter.present({
      kind: 'answer',
      text: 'Le pire score concerne la MR 42.',
    });

    expect(viewModel.liveRegionText).toBe('Le pire score concerne la MR 42.');
    expect(viewModel.avatarState).toBe('idle');
  });

  it('maps an error to the error avatar state with the French unavailable message', () => {
    const viewModel = presenter.present({ kind: 'error' });

    expect(viewModel.avatarState).toBe('error');
    expect(viewModel.unavailableMessage).toBe('// EMBER INDISPONIBLE — réessayer');
    expect(viewModel.liveRegionText).toContain('indisponible');
  });
});
