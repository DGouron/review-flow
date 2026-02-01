import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../main/server.js';
import { createTestConfig } from '../factories/config.factory.js';

describe('Server Integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    const config = createTestConfig();
    server = await createServer({ config });
  });

  afterAll(async () => {
    await server.close();
  });

  it('should respond to health check', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('should respond to settings endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should respond to reviews list endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/reviews',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('reviews');
    expect(body).toHaveProperty('count');
  });
});
