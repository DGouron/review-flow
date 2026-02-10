import type { FastifyPluginAsync } from 'fastify';
import { spawn } from 'node:child_process';
import { logInfo, logWarn, logError } from '../../../frameworks/logging/logBuffer.js';
import { resolveClaudePath } from '../../../shared/services/claudePathResolver.js';

export const cliStatusRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/claude/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn(resolveClaudePath(), ['--version'], {
        timeout: 10000,
        env: { ...process.env, TERM: 'dumb' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('Claude CLI not available', { error: error.message });
        resolve({
          available: false,
          error: error.message,
          message: 'Claude CLI not installed or not accessible',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          const version = stdout.trim();
          logInfo('Claude CLI verified', { version, duration });
          resolve({
            available: true,
            version,
            duration,
            message: 'Claude CLI operational',
          });
        } else {
          logWarn('Claude CLI error', { code, stderr, duration });
          resolve({
            available: false,
            exitCode: code,
            stderr: stderr.trim(),
            message: stderr.includes('not logged in')
              ? 'Not authenticated - run "claude login"'
              : 'Claude CLI error',
          });
        }
      });
    });
  });

  fastify.get('/api/gitlab/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn('glab', ['api', 'user'], {
        timeout: 10000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('GitLab CLI not available', { error: error.message });
        resolve({
          available: false,
          authenticated: false,
          error: error.message,
          message: 'GitLab CLI (glab) not installed',
          command: 'sudo apt install glab',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const user = JSON.parse(stdout);
            logInfo('GitLab CLI verified', { username: user.username, duration });
            resolve({
              available: true,
              authenticated: true,
              username: user.username,
              duration,
              message: 'GitLab CLI operational',
            });
          } catch {
            logWarn('GitLab CLI invalid response', { duration });
            resolve({
              available: true,
              authenticated: false,
              message: 'Invalid GitLab response',
            });
          }
        } else {
          logWarn('GitLab CLI not authenticated', { code, stderr, duration });
          resolve({
            available: true,
            authenticated: false,
            message: 'Not authenticated to GitLab',
          });
        }
      });
    });
  });

  fastify.get('/api/github/status', async () => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn('gh', ['api', 'user'], {
        timeout: 10000,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logError('GitHub CLI not available', { error: error.message });
        resolve({
          available: false,
          authenticated: false,
          error: error.message,
          message: 'GitHub CLI (gh) not installed',
          command: 'sudo apt install gh',
        });
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const user = JSON.parse(stdout);
            logInfo('GitHub CLI verified', { username: user.login, duration });
            resolve({
              available: true,
              authenticated: true,
              username: user.login,
              duration,
              message: 'GitHub CLI operational',
            });
          } catch {
            logWarn('GitHub CLI invalid response', { duration });
            resolve({
              available: true,
              authenticated: false,
              message: 'Invalid GitHub response',
            });
          }
        } else {
          logWarn('GitHub CLI not authenticated', { code, stderr, duration });
          resolve({
            available: true,
            authenticated: false,
            message: 'Not authenticated - run: gh auth login',
          });
        }
      });
    });
  });
};
