import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { RoleSessionJobFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/roleSessionJob.fileSystem.gateway.js';
import { RoleSessionJobFileFactory } from '@/tests/factories/roleSessionJobFile.factory.js';

const jobId = 'github:acme/app:2111';
const jobFileName = 'github-acme-app-2111.json';

describe('RoleSessionJobFileSystemGateway', () => {
  let jobsDirectory: string;
  let gateway: RoleSessionJobFileSystemGateway;

  beforeEach(() => {
    jobsDirectory = mkdtempSync(join(tmpdir(), 'role-session-job-'));
    gateway = new RoleSessionJobFileSystemGateway(jobsDirectory);
  });

  afterEach(() => {
    rmSync(jobsDirectory, { recursive: true, force: true });
  });

  function writeJobFile(content: unknown): void {
    writeFileSync(join(jobsDirectory, jobFileName), JSON.stringify(content));
  }

  function readJobFile(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(jobsDirectory, jobFileName), 'utf-8'));
  }

  describe('find', () => {
    it('reads the job subject, worktree and recorded role sessions', () => {
      writeJobFile(
        RoleSessionJobFileFactory.create({
          jobType: 'followup',
          mrNumber: 2111,
          worktreePath: '/wt/github-acme-app-2111',
          roleSessions: [
            { sessionId: 'a1b2c3d4', role: 'greffe', launchedAt: '2026-11-27T09:00:00.000Z' },
          ],
        }),
      );

      expect(gateway.find(jobId)).toEqual({
        status: 'found',
        job: {
          jobId,
          jobType: 'followup',
          mergeRequestNumber: 2111,
          localPath: '/home/ai/projects/acme-app',
          worktreePath: '/wt/github-acme-app-2111',
          roleSessions: [
            { sessionId: 'a1b2c3d4', role: 'greffe', launchedAt: '2026-11-27T09:00:00.000Z' },
          ],
        },
      });
    });

    it('reads a job file without role sessions as an empty list', () => {
      writeJobFile(RoleSessionJobFileFactory.create());

      const lookup = gateway.find(jobId);

      expect(lookup.status === 'found' && lookup.job.roleSessions).toEqual([]);
    });

    it('reports a missing job file as not found', () => {
      expect(gateway.find(jobId)).toEqual({ status: 'not-found' });
    });

    it('reports a job file without worktree as unusable', () => {
      const { worktreePath: _omitted, ...withoutWorktree } = RoleSessionJobFileFactory.create();
      writeJobFile(withoutWorktree);

      expect(gateway.find(jobId)).toEqual({
        status: 'unusable',
        reason: `job ${jobId} has no worktree yet`,
      });
    });

    it('reports an unreadable job file as unusable', () => {
      writeFileSync(join(jobsDirectory, jobFileName), '{not json');

      expect(gateway.find(jobId).status).toBe('unusable');
    });
  });

  describe('recordRoleSession', () => {
    it('appends the record and keeps every other key of the job file', () => {
      writeJobFile(
        RoleSessionJobFileFactory.create({
          roleSessions: [
            { sessionId: 'first001', role: 'lot:bugs', launchedAt: '2026-11-27T09:00:00.000Z' },
          ],
        }),
      );

      const result = gateway.recordRoleSession(jobId, {
        sessionId: parseSessionId('second02'),
        role: 'lot:bugs',
        launchedAt: '2026-11-27T09:05:00.000Z',
      });

      expect(result).toEqual({ recorded: true });
      const jobFile = readJobFile();
      expect(jobFile.roleSessions).toEqual([
        { sessionId: 'first001', role: 'lot:bugs', launchedAt: '2026-11-27T09:00:00.000Z' },
        { sessionId: 'second02', role: 'lot:bugs', launchedAt: '2026-11-27T09:05:00.000Z' },
      ]);
      expect(jobFile.mergeRequestId).toBe('github-acme/app-2111');
    });

    it('refuses to record into a job file that no longer exists', () => {
      const result = gateway.recordRoleSession(jobId, {
        sessionId: parseSessionId('a1b2c3d4'),
        role: 'greffe',
        launchedAt: '2026-11-27T09:00:00.000Z',
      });

      expect(result.recorded).toBe(false);
    });
  });

  describe('listRecordedRoleSessions', () => {
    it('lists the role sessions every present job file records, with their job', () => {
      writeJobFile(
        RoleSessionJobFileFactory.create({
          roleSessions: [
            { sessionId: 'a1b2c3d4', role: 'greffe', launchedAt: '2026-11-27T09:00:00.000Z' },
          ],
        }),
      );
      writeFileSync(
        join(jobsDirectory, 'gitlab-acme-api-7.json'),
        JSON.stringify({
          jobId: 'gitlab:acme/api:7',
          roleSessions: [
            { sessionId: 'e5f6a7b8', role: 'arbitre', launchedAt: '2026-11-27T10:00:00.000Z' },
          ],
        }),
      );
      writeFileSync(join(jobsDirectory, 'broken.json'), '{not json');
      writeFileSync(join(jobsDirectory, 'github-acme-app-2111.lock'), '');

      const recorded = gateway.listRecordedRoleSessions();

      expect(recorded).toHaveLength(2);
      expect(recorded).toEqual(
        expect.arrayContaining([
          {
            jobId,
            record: {
              sessionId: 'a1b2c3d4',
              role: 'greffe',
              launchedAt: '2026-11-27T09:00:00.000Z',
            },
          },
          {
            jobId: 'gitlab:acme/api:7',
            record: {
              sessionId: 'e5f6a7b8',
              role: 'arbitre',
              launchedAt: '2026-11-27T10:00:00.000Z',
            },
          },
        ]),
      );
    });

    it('lists nothing when the jobs directory does not exist', () => {
      const missingDirectory = new RoleSessionJobFileSystemGateway(join(jobsDirectory, 'absent'));

      expect(missingDirectory.listRecordedRoleSessions()).toEqual([]);
    });
  });

  describe('withExclusiveAccess', () => {
    it('never runs two works of the same job at once', async () => {
      const events: string[] = [];
      const work = (label: string) => async () => {
        events.push(`${label}:start`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push(`${label}:end`);
        return label;
      };

      const results = await Promise.all([
        gateway.withExclusiveAccess(jobId, work('first')),
        gateway.withExclusiveAccess(jobId, work('second')),
      ]);

      expect(results).toEqual(['first', 'second']);
      expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    });

    it('releases the lock when the work throws', async () => {
      await expect(
        gateway.withExclusiveAccess(jobId, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(existsSync(join(jobsDirectory, 'github-acme-app-2111.lock'))).toBe(false);
    });

    const lockPath = (): string => join(jobsDirectory, 'github-acme-app-2111.lock');

    it('creates a missing jobs directory instead of waiting for a lock nobody holds', async () => {
      const missingDirectory = join(jobsDirectory, 'not-yet-created');
      const fresh = new RoleSessionJobFileSystemGateway(missingDirectory, { lockWaitLimitMs: 200 });

      await expect(fresh.withExclusiveAccess(jobId, async () => 'done')).resolves.toBe('done');
    });

    it('never removes a lock another launch took over in the meantime', async () => {
      await gateway.withExclusiveAccess(jobId, async () => {
        writeFileSync(lockPath(), 'token-of-another-launch');
      });

      expect(readFileSync(lockPath(), 'utf-8')).toBe('token-of-another-launch');
    });

    it('waits for a fresh lock held by another launch, then gives up', async () => {
      writeFileSync(lockPath(), 'token-of-another-launch');
      const impatient = new RoleSessionJobFileSystemGateway(jobsDirectory, {
        lockWaitLimitMs: 150,
      });

      await expect(impatient.withExclusiveAccess(jobId, async () => 'never')).rejects.toThrow(
        /another launch holds/,
      );
      expect(readFileSync(lockPath(), 'utf-8')).toBe('token-of-another-launch');
    });

    it('takes over a stale lock left by a launch that died', async () => {
      writeFileSync(lockPath(), 'token-of-a-dead-launch');
      const threeMinutesAgo = new Date(Date.now() - 180_000);
      utimesSync(lockPath(), threeMinutesAgo, threeMinutesAgo);

      await expect(gateway.withExclusiveAccess(jobId, async () => 'done')).resolves.toBe('done');
      expect(existsSync(lockPath())).toBe(false);
    });
  });
});
