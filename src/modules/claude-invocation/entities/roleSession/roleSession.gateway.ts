import type { DispatchResult } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { RoleModel } from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';

export type RoleSessionLaunch = {
  name: string;
  model: RoleModel;
  brief: string;
  cwd: string;
};

export type BackgroundSession = {
  sessionId: SessionId;
  name: string | null;
  cwd: string | null;
  startedAt: Date | null;
  /** As `claude agents` reports it: working, idle, blocked, done, stopped, failed… */
  state: string | null;
};

export type BackgroundSessionListing =
  | { status: 'listed'; sessions: BackgroundSession[] }
  | { status: 'failed'; reason: string };

export interface RoleSessionGateway {
  /** Starts a read-only background session without any MCP server. */
  launch(launch: RoleSessionLaunch): Promise<DispatchResult>;
  /** Every background session Claude still knows, finished ones included. */
  listBackgroundSessions(): Promise<BackgroundSessionListing>;
}
