import { EventEmitter } from 'node:events';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  emitStdout(data: string): void {
    this.stdout.emit('data', Buffer.from(data));
  }

  emitStderr(data: string): void {
    this.stderr.emit('data', Buffer.from(data));
  }
}

let currentChild: FakeChildProcess;
let lastCommand: string;

vi.mock('node:child_process', () => ({
  spawn: (command: string) => {
    lastCommand = command;
    return currentChild;
  },
}));

vi.mock('@/shared/services/claudePathResolver.js', () => ({
  resolveClaudePath: () => '/usr/bin/claude',
}));

const { cliStatusRoutes } =
  await import('@/modules/cli-configuration/interface-adapters/controllers/http/cliStatus.routes.js');

describe('cliStatus routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cliStatusRoutes);
    await app.ready();
    currentChild = new FakeChildProcess();
  });

  function injectAfter(
    url: string,
    drive: (child: FakeChildProcess) => void,
  ): Promise<ReturnType<FastifyInstance['inject']> extends Promise<infer R> ? R : never> {
    const responsePromise = app.inject({ method: 'GET', url });
    setImmediate(() => drive(currentChild));
    return responsePromise;
  }

  describe('GET /api/claude/status', () => {
    it('should report available when version is returned with exit code 0', async () => {
      const response = await injectAfter('/api/claude/status', (child) => {
        child.emitStdout('1.2.3');
        child.emit('close', 0);
      });

      expect(lastCommand).toBe('/usr/bin/claude');
      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.version).toBe('1.2.3');
      expect(body.message).toBe('Claude CLI operational');
      expect(typeof body.duration).toBe('number');
    });

    it('should report unavailable with the error message on spawn error', async () => {
      const response = await injectAfter('/api/claude/status', (child) => {
        child.emit('error', new Error('spawn ENOENT'));
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.error).toBe('spawn ENOENT');
      expect(body.message).toBe('Claude CLI not installed or not accessible');
    });

    it('should report authentication message when stderr mentions not logged in', async () => {
      const response = await injectAfter('/api/claude/status', (child) => {
        child.emitStderr('error: not logged in');
        child.emit('close', 1);
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.exitCode).toBe(1);
      expect(body.stderr).toBe('error: not logged in');
      expect(body.message).toBe('Not authenticated - run "claude login"');
    });

    it('should report generic CLI error when exit code is non-zero without auth hint', async () => {
      const response = await injectAfter('/api/claude/status', (child) => {
        child.emitStderr('boom');
        child.emit('close', 2);
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.exitCode).toBe(2);
      expect(body.message).toBe('Claude CLI error');
    });

    it('should report error when exit code is 0 but stdout is empty', async () => {
      const response = await injectAfter('/api/claude/status', (child) => {
        child.emit('close', 0);
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.message).toBe('Claude CLI error');
    });
  });

  describe('GET /api/gitlab/status', () => {
    it('should spawn glab and report authenticated with valid JSON user', async () => {
      const response = await injectAfter('/api/gitlab/status', (child) => {
        child.emitStdout(JSON.stringify({ username: 'octocat' }));
        child.emit('close', 0);
      });

      expect(lastCommand).toBe('glab');
      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(true);
      expect(body.username).toBe('octocat');
      expect(body.message).toBe('GitLab CLI operational');
    });

    it('should report invalid response when stdout is not valid JSON', async () => {
      const response = await injectAfter('/api/gitlab/status', (child) => {
        child.emitStdout('not-json');
        child.emit('close', 0);
      });

      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(false);
      expect(body.message).toBe('Invalid GitLab response');
    });

    it('should report not installed on spawn error', async () => {
      const response = await injectAfter('/api/gitlab/status', (child) => {
        child.emit('error', new Error('glab missing'));
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.authenticated).toBe(false);
      expect(body.error).toBe('glab missing');
      expect(body.message).toBe('GitLab CLI (glab) not installed');
      expect(body.command).toBe('sudo apt install glab');
    });

    it('should report not authenticated when exit code is non-zero', async () => {
      const response = await injectAfter('/api/gitlab/status', (child) => {
        child.emitStderr('unauthorized');
        child.emit('close', 1);
      });

      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(false);
      expect(body.message).toBe('Not authenticated to GitLab');
    });
  });

  describe('GET /api/github/status', () => {
    it('should spawn gh and report authenticated with valid JSON user', async () => {
      const response = await injectAfter('/api/github/status', (child) => {
        child.emitStdout(JSON.stringify({ login: 'monalisa' }));
        child.emit('close', 0);
      });

      expect(lastCommand).toBe('gh');
      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(true);
      expect(body.username).toBe('monalisa');
      expect(body.message).toBe('GitHub CLI operational');
    });

    it('should report invalid response when stdout is not valid JSON', async () => {
      const response = await injectAfter('/api/github/status', (child) => {
        child.emitStdout('}{');
        child.emit('close', 0);
      });

      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(false);
      expect(body.message).toBe('Invalid GitHub response');
    });

    it('should report not installed on spawn error', async () => {
      const response = await injectAfter('/api/github/status', (child) => {
        child.emit('error', new Error('gh missing'));
      });

      const body = response.json();
      expect(body.available).toBe(false);
      expect(body.authenticated).toBe(false);
      expect(body.error).toBe('gh missing');
      expect(body.message).toBe('GitHub CLI (gh) not installed');
      expect(body.command).toBe('sudo apt install gh');
    });

    it('should report not authenticated when exit code is non-zero', async () => {
      const response = await injectAfter('/api/github/status', (child) => {
        child.emitStderr('bad creds');
        child.emit('close', 1);
      });

      const body = response.json();
      expect(body.available).toBe(true);
      expect(body.authenticated).toBe(false);
      expect(body.message).toBe('Not authenticated - run: gh auth login');
    });
  });
});
