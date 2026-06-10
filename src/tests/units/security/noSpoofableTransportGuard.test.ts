import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

describe('no spoofable transport guard (AC6)', () => {
  const middleware = readSource(
    'src/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.ts',
  );
  const routes = readSource('src/main/routes.ts');

  it('the transport guard never reads request.protocol or request.ip as a trust input', () => {
    expect(middleware).not.toMatch(/\.protocol\b/);
    expect(middleware).not.toMatch(/\brequest\.ip\b/);
    expect(middleware).not.toMatch(/\breq\.ip\b/);
  });

  it('the transport guard derives the socket address from socket.remoteAddress only', () => {
    expect(middleware).toContain('socket.remoteAddress');
  });

  it('the webhook routes never use request.protocol or request.ip as a trust guard', () => {
    expect(routes).not.toMatch(/request\.protocol\b/);
    expect(routes).not.toMatch(/\brequest\.ip\b/);
    expect(routes).not.toMatch(/\breq\.ip\b/);
  });

  it('the webhook routes feed the guard from the raw socket address', () => {
    expect(routes).toContain('request.socket.remoteAddress');
  });
});
