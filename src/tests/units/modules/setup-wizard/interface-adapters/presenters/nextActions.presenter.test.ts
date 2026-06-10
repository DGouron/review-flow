import { describe, it, expect } from 'vitest';

import { NextActionsPresenter } from '@/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.js';

describe('NextActionsPresenter', () => {
  const presenter = new NextActionsPresenter();

  it('builds the webhook URL from platform + host + port', () => {
    const vm = presenter.present({
      platform: 'github',
      host: 'reviewflow.example.com',
      port: 3847,
      webhookSecret: 'a'.repeat(64),
      projectPath: '/tmp/p',
      showSecrets: false,
    });
    expect(vm.webhookUrl).toBe('http://reviewflow.example.com:3847/webhooks/github');
  });

  it('masks the secret by default', () => {
    const secret = 'a'.repeat(64);
    const vm = presenter.present({
      platform: 'github',
      host: 'x',
      port: 3847,
      webhookSecret: secret,
      projectPath: '/tmp/p',
      showSecrets: false,
    });
    expect(vm.maskedSecret).not.toBe(secret);
    expect(vm.fullSecret).toBeNull();
  });

  it('exposes the full secret when --show-secrets is set', () => {
    const secret = 'a'.repeat(64);
    const vm = presenter.present({
      platform: 'github',
      host: 'x',
      port: 3847,
      webhookSecret: secret,
      projectPath: '/tmp/p',
      showSecrets: true,
    });
    expect(vm.fullSecret).toBe(secret);
  });

  it('emits a platform-appropriate event type for github', () => {
    const vm = presenter.present({
      platform: 'github',
      host: 'x',
      port: 3847,
      webhookSecret: '',
      projectPath: '/tmp/p',
      showSecrets: false,
    });
    expect(vm.eventType).toContain('pull_request');
  });

  it('emits a platform-appropriate event type for gitlab', () => {
    const vm = presenter.present({
      platform: 'gitlab',
      host: 'x',
      port: 3847,
      webhookSecret: '',
      projectPath: '/tmp/p',
      showSecrets: false,
    });
    expect(vm.eventType).toContain('Merge request');
  });
});
