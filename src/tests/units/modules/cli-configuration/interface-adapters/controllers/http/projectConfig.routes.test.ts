import { statSync, type Stats } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ProjectConfig } from '@/config/projectConfig.js';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { ProjectConfigFactory } from '@/tests/factories/projectConfig.factory.js';
import { StubProjectConfigGateway } from '@/tests/stubs/projectConfigGateway.stub.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof fsPromises>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    stat: vi.fn(),
  };
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(projectConfigRoutes);
  return app;
}

function jsonResponse(body: unknown): string {
  return JSON.stringify(body);
}

function fakeStats(): Stats {
  const stats = statSync(tmpdir());
  if (!stats) {
    throw new Error('statSync(tmpdir()) returned undefined — test environment is broken');
  }
  return stats;
}

describe('projectConfigRoutes — GET /api/project-config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the config payload including reviewFocus when present', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.config.reviewFocus).toBe('back');
    await app.close();
  });

  it('accepts a config without reviewSkill when reviewFocus is set', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'doc',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    await app.close();
  });

  it('rejects an invalid reviewFocus value', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'mobile',
        }),
      ),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Invalid reviewFocus/);
    await app.close();
  });

  it('still requires reviewSkill when reviewFocus is absent', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/reviewSkill/);
    await app.close();
  });

  it('checks the SKILL.md derived from reviewFocus when reviewSkill is absent', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    const statMock = vi.mocked(fsPromises.stat);
    statMock.mockResolvedValue(fakeStats());

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const checkedPaths = statMock.mock.calls.map((call) => String(call[0]));
    expect(checkedPaths.some((checkedPath) => checkedPath.includes('review-back/SKILL.md'))).toBe(
      true,
    );
    await app.close();
  });

  it('returns a clear error when the derived SKILL.md does not exist', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/review-back/);
    await app.close();
  });

  it('returns 400 when the path query parameter is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config',
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Project path required');
    await app.close();
  });

  it('returns 400 when the path is not absolute', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=relative/path',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid path (must be absolute without ..)');
    await app.close();
  });

  it('reports missing base required fields when they are absent', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(jsonResponse({ reviewSkill: 'review-front' }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Missing fields:/);
    expect(payload.error).toMatch(/github/);
    await app.close();
  });

  it('resolves the reviewSkill SKILL.md when reviewSkill is explicitly set', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(ProjectConfigFactory.create({ reviewSkill: 'review-front' })),
    );
    const statMock = vi.mocked(fsPromises.stat);
    statMock.mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    expect(response.json().success).toBe(true);
    const checkedPaths = statMock.mock.calls.map((call) => String(call[0]));
    expect(checkedPaths.some((checkedPath) => checkedPath.includes('review-front/SKILL.md'))).toBe(
      true,
    );
    await app.close();
  });

  it('rejects a config whose agents field is not an array', async () => {
    const config = { ...ProjectConfigFactory.create(), agents: 'not-an-array' };
    vi.mocked(fsPromises.readFile).mockResolvedValue(jsonResponse(config));
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Field "agents" must be an array');
    await app.close();
  });

  it('rejects a config whose agents entries are malformed', async () => {
    const config = {
      ...ProjectConfigFactory.create(),
      agents: [{ name: '', displayName: '' }],
    };
    vi.mocked(fsPromises.readFile).mockResolvedValue(jsonResponse(config));
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Invalid agents format/);
    await app.close();
  });

  it('accepts a config with a well-formed agents array', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          agents: [{ name: 'security', displayName: 'Security Auditor' }],
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    expect(response.json().success).toBe(true);
    await app.close();
  });

  it('returns the ENOENT message when config.json is missing', async () => {
    const enoentError = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    vi.mocked(fsPromises.readFile).mockRejectedValue(enoentError);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('config.json file not found in .claude/reviews/');
    await app.close();
  });

  it('returns a read error when the config file is not valid JSON', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('not-json{');

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/^Read error: /);
    await app.close();
  });

  it('stringifies a non-Error thrown value in the read error message', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue('boom');

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Read error: boom');
    await app.close();
  });
});

function baseConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
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

async function buildAppWithPatch(gateway: StubProjectConfigGateway): Promise<FastifyInstance> {
  const app = Fastify();
  const updateProjectConfig = new UpdateProjectConfigUseCase(gateway);
  await app.register(projectConfigRoutes, { updateProjectConfig });
  return app;
}

describe('projectConfigRoutes — PATCH /api/project-config', () => {
  it('returns 400 when the path query parameter is missing', async () => {
    const gateway = new StubProjectConfigGateway();
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config',
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when the path contains "..":', async () => {
    const gateway = new StubProjectConfigGateway();
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/../etc'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 200 + { success: true, config } on a successful update', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.config.language).toBe('en');
    await app.close();
  });

  it('returns 400 + French message when externalLink is http://', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { externalLink: 'http://insecure' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Le lien doit être en HTTPS');
    await app.close();
  });

  it('returns 404 when the project has no config', async () => {
    const gateway = new StubProjectConfigGateway();
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/unknown'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns 422 + "Configuration projet illisible" when the file is malformed', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    gateway.forceMalformed('/repo/A');
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('Configuration projet illisible');
    await app.close();
  });

  it('returns 500 + "Échec de la sauvegarde" when the gateway write fails', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    gateway.forceIoError();
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toBe('Échec de la sauvegarde');
    await app.close();
  });

  it('accepts a numeric qualityThreshold in the patch body', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { qualityThreshold: 7 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.qualityThreshold).toBe(7);
    await app.close();
  });

  it('returns 400 when qualityThreshold is out of range', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { qualityThreshold: 15 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/qualityThreshold/);
    await app.close();
  });

  it('clears qualityThreshold from the persisted config when patch sends null', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig({ qualityThreshold: 7 }));
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { qualityThreshold: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.qualityThreshold).toBeUndefined();
    await app.close();
  });

  it('accepts a numeric maxConcurrentReviews in the patch body', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.maxConcurrentReviews).toBe(4);
    await app.close();
  });

  it('accepts a string integer "4" for maxConcurrentReviews', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: '4' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.maxConcurrentReviews).toBe(4);
    await app.close();
  });

  it('returns 400 with French range message when maxConcurrentReviews is 0', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('La valeur doit être comprise entre 1 et 10');
    await app.close();
  });

  it('returns 400 with French range message when maxConcurrentReviews is 11', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: 11 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('La valeur doit être comprise entre 1 et 10');
    await app.close();
  });

  it('returns 400 with French integer message when maxConcurrentReviews is "abc"', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: 'abc' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('La valeur doit être un nombre entier');
    await app.close();
  });

  it('returns 400 with French required message when maxConcurrentReviews is empty string', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('La valeur est obligatoire');
    await app.close();
  });

  it('clears maxConcurrentReviews from persisted config when patch sends null', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig({ maxConcurrentReviews: 4 }));
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.maxConcurrentReviews).toBeUndefined();
    await app.close();
  });

  it('returns 501 when the PATCH use case is not configured', async () => {
    const app = Fastify();
    await app.register(projectConfigRoutes);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json().error).toBe('PATCH not configured');
    await app.close();
  });

  it('returns 400 when the body is not a JSON object', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(['not', 'an', 'object']),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Body must be a JSON object');
    await app.close();
  });

  it('applies a valid defaultModel from the patch body', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig({ defaultModel: 'sonnet' }));
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { defaultModel: 'opus' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.defaultModel).toBe('opus');
    await app.close();
  });

  it('treats an empty-string qualityThreshold as a clear request', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig({ qualityThreshold: 7 }));
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { qualityThreshold: '' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().config.qualityThreshold).toBeUndefined();
    await app.close();
  });

  it('keeps a boolean maxConcurrentReviews to surface a validation error', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { maxConcurrentReviews: true },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('applies reviewSkill and reviewFollowupSkill string values from the patch', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const app = await buildAppWithPatch(gateway);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { reviewSkill: 'review-back', reviewFollowupSkill: 'review-followup-v2' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config.reviewSkill).toBe('review-back');
    expect(body.config.reviewFollowupSkill).toBe('review-followup-v2');
    await app.close();
  });

  it('invokes the onSaved callback after a successful update', async () => {
    const gateway = new StubProjectConfigGateway();
    gateway.set('/repo/A', baseConfig());
    const updateProjectConfig = new UpdateProjectConfigUseCase(gateway);
    const onSaved = vi.fn();
    const app = Fastify();
    await app.register(projectConfigRoutes, { updateProjectConfig, onSaved });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/project-config?path=' + encodeURIComponent('/repo/A'),
      payload: { language: 'en' },
    });

    expect(response.statusCode).toBe(200);
    expect(onSaved).toHaveBeenCalledWith('/repo/A');
    await app.close();
  });
});
