export type RoleSessionVerdict = 'done' | 'failed' | 'timeout';

export type RoleSessionProgress = RoleSessionVerdict | 'running';

export type RoleSessionFacts = {
  /** False once `claude agents` no longer lists the session. */
  listed: boolean;
  state: string | null;
  launchedAt: Date;
  now: Date;
  timeoutMs: number;
};

/**
 * Where a role session stands for the clerk who waits on it. A session that ended its turn is
 * `done`, whatever it sent; one still working past its timeout is `timeout`.
 */
export function roleSessionProgressOf(facts: RoleSessionFacts): RoleSessionProgress {
  if (!facts.listed) return 'failed';
  if (facts.state === 'done') return 'done';
  if (facts.state === 'failed') return 'failed';
  if (facts.now.getTime() - facts.launchedAt.getTime() > facts.timeoutMs) return 'timeout';
  if (facts.state === 'stopped') return 'failed';
  return 'running';
}
