import type {
  ClaudeSessionJobType,
  SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';

export interface ClaudeDispatchFlags {
  model: string;
  mcpConfigJson: string;
  systemPrompt: string;
  allowedTools: string;
  disallowedTools: string;
  permissionMode: 'auto' | 'plan';
}

export interface DispatchInput {
  prompt: string;
  flags: ClaudeDispatchFlags;
  localPath: string;
  jobId: string;
  jobType: ClaudeSessionJobType;
}

export type DispatchResult =
  | { status: 'dispatched'; sessionId: SessionId }
  | { status: 'rate-limited'; rawStderr: string }
  | { status: 'failed'; rawStderr: string };

export interface CleanupResult {
  success: boolean;
  warning: string | null;
}

export type AgentStatusValue = 'running' | 'completed' | 'failed' | 'stopped' | 'unknown';

export interface AgentStatusEntry {
  sessionId: SessionId;
  status: AgentStatusValue;
}

export interface DaemonStatus {
  reachable: boolean;
  reason: string | null;
}

export interface UsageReport {
  usesApiPool: boolean;
  raw: string;
}

export interface ClaudeSessionGateway {
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  stop(sessionId: SessionId): Promise<CleanupResult>;
  remove(sessionId: SessionId): Promise<CleanupResult>;
  listAgents(): Promise<AgentStatusEntry[]>;
  daemonStatus(): Promise<DaemonStatus>;
  usage(): Promise<UsageReport>;
  getSessionUsage(sessionId: SessionId, cwd: string): Promise<SessionUsageSnapshot | null>;
}
