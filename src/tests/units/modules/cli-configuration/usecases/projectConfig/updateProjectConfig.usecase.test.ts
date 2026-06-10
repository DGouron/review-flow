import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';

function base(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    github: false,
    gitlab: true,
    defaultModel: 'sonnet',
    reviewSkill: 'review-front',
    reviewFollowupSkill: 'review-followup',
    language: 'fr',
    retentionDays: 14,
    ...overrides,
  };
}

describe('UpdateProjectConfigUseCase', () => {
  it('merges only whitelisted fields (language, defaultModel, reviewSkill, reviewFollowupSkill, externalLink)', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set(
      '/repo/A',
      base({
        language: 'fr',
        agents: [{ name: 'security', displayName: 'Security' }],
        routingPolicy: { haikuMaxLines: 50, sonnetMaxLines: 500 },
        retentionDays: 30,
      }),
    );
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { language: 'en' } });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.language).toBe('en');
      expect(result.config.agents).toEqual([{ name: 'security', displayName: 'Security' }]);
      expect(result.config.routingPolicy).toEqual({ haikuMaxLines: 50, sonnetMaxLines: 500 });
      expect(result.config.retentionDays).toBe(30);
    }
  });

  it('ignores non-whitelisted fields in the patch payload silently', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    usecase.execute({
      path: '/repo/A',
      patch: {
        language: 'en',
        agents: [{ name: 'evil', displayName: 'Evil' }],
        retentionDays: 999,
      } as never,
    });

    const persisted = gateway.get('/repo/A');
    expect(persisted?.agents).toBeUndefined();
    expect(persisted?.retentionDays).toBe(14);
    expect(persisted?.language).toBe('en');
  });

  it('accepts a valid https externalLink', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { externalLink: 'https://notion.so/team' },
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.externalLink).toBe('https://notion.so/team');
    }
  });

  it('empty string externalLink removes the key from the persisted config', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base({ externalLink: 'https://old.example' }));
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { externalLink: '' } });

    expect(result.status).toBe('success');
    const persisted = gateway.get('/repo/A');
    expect(persisted?.externalLink).toBeUndefined();
  });

  it('rejects http:// with "Le lien doit être en HTTPS"', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { externalLink: 'http://insecure.example' },
    });

    expect(result).toEqual({ status: 'invalid', reason: 'Le lien doit être en HTTPS' });
  });

  it('rejects javascript: with "URL invalide"', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { externalLink: 'javascript:alert(1)' },
    });

    expect(result).toEqual({ status: 'invalid', reason: 'URL invalide' });
  });

  it('rejects free text with "URL invalide"', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { externalLink: 'not a url' },
    });

    expect(result).toEqual({ status: 'invalid', reason: 'URL invalide' });
  });

  it('returns "not-found" when the project has no config on disk', () => {
    const gateway = new StubProjectConfigGateway();
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/unknown', patch: { language: 'en' } });

    expect(result.status).toBe('not-found');
  });

  it('returns "malformed" when the config file is corrupt', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    gateway.forceMalformed('/repo/A');
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { language: 'en' } });

    expect(result.status).toBe('malformed');
  });

  it('returns "io-error" when the gateway write fails', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    gateway.forceIoError('disk full');
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { language: 'en' } });

    expect(result.status).toBe('io-error');
    if (result.status === 'io-error') {
      expect(result.reason).toBe('disk full');
    }
  });

  it('invokes the onUpdated hook with the merged config on success', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base({ language: 'fr' }));
    const observed: ProjectConfig[] = [];
    const usecase = new UpdateProjectConfigUseCase(gateway, (config) => {
      observed.push(config);
    });

    usecase.execute({ path: '/repo/A', patch: { language: 'en' } });

    expect(observed).toHaveLength(1);
    expect(observed[0].language).toBe('en');
  });

  it('merges a valid qualityThreshold (7) into the persisted config', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: 7 } });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.qualityThreshold).toBe(7);
    }
  });

  it('accepts 0 as a valid qualityThreshold', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: 0 } });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.qualityThreshold).toBe(0);
    }
  });

  it('accepts 10 as a valid qualityThreshold', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: 10 } });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.qualityThreshold).toBe(10);
    }
  });

  it('rejects qualityThreshold below 0', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: -1 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'qualityThreshold must be an integer between 0 and 10',
    });
  });

  it('rejects qualityThreshold above 10', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: 11 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'qualityThreshold must be an integer between 0 and 10',
    });
  });

  it('rejects non-integer qualityThreshold', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: 7.5 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'qualityThreshold must be an integer between 0 and 10',
    });
  });

  it('null qualityThreshold removes the key from the persisted config', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base({ qualityThreshold: 7 }));
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { qualityThreshold: null } });

    expect(result.status).toBe('success');
    const persisted = gateway.get('/repo/A');
    expect(persisted?.qualityThreshold).toBeUndefined();
  });

  it('merges a valid maxConcurrentReviews (4) into the persisted config', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { maxConcurrentReviews: 4 } });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.maxConcurrentReviews).toBe(4);
    }
  });

  it('rejects maxConcurrentReviews 0 with French range message', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { maxConcurrentReviews: 0 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'La valeur doit être comprise entre 1 et 10',
    });
  });

  it('rejects maxConcurrentReviews 11 with French range message', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { maxConcurrentReviews: 11 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'La valeur doit être comprise entre 1 et 10',
    });
  });

  it('rejects non-integer maxConcurrentReviews with French integer message', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({ path: '/repo/A', patch: { maxConcurrentReviews: 2.5 } });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'La valeur doit être un nombre entier',
    });
  });

  it('rejects non-numeric maxConcurrentReviews with French integer message', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { maxConcurrentReviews: 'abc' as never },
    });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'La valeur doit être un nombre entier',
    });
  });

  it('rejects empty string maxConcurrentReviews with French required message', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base());
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { maxConcurrentReviews: '' as never },
    });

    expect(result).toEqual({
      status: 'invalid',
      reason: 'La valeur est obligatoire',
    });
  });

  it('null maxConcurrentReviews removes the key from the persisted config', () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', base({ maxConcurrentReviews: 4 }));
    const usecase = new UpdateProjectConfigUseCase(gateway);

    const result = usecase.execute({
      path: '/repo/A',
      patch: { maxConcurrentReviews: null },
    });

    expect(result.status).toBe('success');
    const persisted = gateway.get('/repo/A');
    expect(persisted?.maxConcurrentReviews).toBeUndefined();
  });
});
