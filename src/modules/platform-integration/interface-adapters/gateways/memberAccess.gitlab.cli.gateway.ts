import { z } from 'zod';

import type { MemberAccessGateway } from '@/modules/platform-integration/entities/memberAccess/memberAccess.gateway.js';
import {
  MEMBER_ACCESS_LEVELS,
  type MemberAccessLevel,
  type ResolvedAccessLevel,
} from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';

export type CommandExecutor = (command: string) => string;

export interface GitLabMemberAccessOptions {
  ttlMs: number;
  clock: () => number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const gitLabUserSchema = z.object({ id: z.number().int() });
const gitLabUserListSchema = z.array(gitLabUserSchema);
const gitLabMemberSchema = z.object({ access_level: z.number().int() });

const KNOWN_ACCESS_LEVELS = new Set<number>(Object.values(MEMBER_ACCESS_LEVELS));

interface CacheEntry {
  accessLevel: ResolvedAccessLevel;
  expiresAt: number;
}

function toKnownAccessLevel(value: number): MemberAccessLevel | null {
  if (!KNOWN_ACCESS_LEVELS.has(value)) {
    return null;
  }
  const known = Object.values(MEMBER_ACCESS_LEVELS).find((level) => level === value);
  return known ?? null;
}

/**
 * Cached, fail-closed GitLab membership resolver (SPEC-197).
 *
 * Resolves the actor's numeric id via the Users API (`/users?username=`) then the
 * project membership via the Members API (`/projects/:id/members/all/:user_id`),
 * both through the injected authenticated glab executor. Results are cached per
 * username with a TTL. Every failure mode — lookup error, timeout, ambiguous match
 * (more than one user), unknown username (empty list), non-member, or an
 * access_level outside the known scale — resolves to `null` (non-trusted). The
 * cache keys strictly on username, so a trusted result for one actor never widens
 * trust for another (AC5).
 */
export class GitLabMemberAccessCliGateway implements MemberAccessGateway {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly clock: () => number;

  constructor(
    private readonly executor: CommandExecutor,
    options?: Partial<GitLabMemberAccessOptions>,
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.clock = options?.clock ?? (() => Date.now());
  }

  async resolve(projectPath: string, username: string): Promise<ResolvedAccessLevel> {
    const cacheKey = `${projectPath} ${username}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.clock()) {
      return cached.accessLevel;
    }

    const accessLevel = this.lookup(projectPath, username);
    this.cache.set(cacheKey, { accessLevel, expiresAt: this.clock() + this.ttlMs });
    return accessLevel;
  }

  private lookup(projectPath: string, username: string): ResolvedAccessLevel {
    const userId = this.resolveUserId(username);
    if (userId === null) {
      return null;
    }
    return this.resolveMembership(projectPath, userId);
  }

  private resolveUserId(username: string): number | null {
    try {
      const encodedUsername = encodeURIComponent(username);
      const response = this.executor(`glab api users?username=${encodedUsername}`);
      const parsed = gitLabUserListSchema.safeParse(JSON.parse(response));
      if (!parsed.success || parsed.data.length !== 1) {
        return null;
      }
      return parsed.data[0].id;
    } catch {
      return null;
    }
  }

  private resolveMembership(projectPath: string, userId: number): ResolvedAccessLevel {
    try {
      const encodedProject = projectPath.replace(/\//g, '%2F');
      const response = this.executor(`glab api projects/${encodedProject}/members/all/${userId}`);
      const parsed = gitLabMemberSchema.safeParse(JSON.parse(response));
      if (!parsed.success) {
        return null;
      }
      return toKnownAccessLevel(parsed.data.access_level);
    } catch {
      return null;
    }
  }
}
