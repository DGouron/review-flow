import type {
  AgentStatusEntry,
  AgentStatusValue,
  ClaudeSessionGateway,
  CleanupResult,
  DaemonStatus,
  DispatchInput,
  DispatchResult,
  UsageReport,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import {
  parseSessionId,
  type SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { SessionUsageSnapshot } from '@/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.js';

interface ScheduledAgentStatus {
  sessionId: SessionId;
  status: AgentStatusValue;
  afterPollCount: number;
}

export class StubClaudeSessionGateway implements ClaudeSessionGateway {
  dispatchCalls: DispatchInput[] = [];
  stopCalls: string[] = [];
  removeCalls: string[] = [];
  listAgentsCallCount = 0;
  getSessionUsageCalls: Array<{ sessionId: SessionId; cwd: string }> = [];
  callOrder: string[] = [];

  private dispatchResult: DispatchResult = {
    status: 'dispatched',
    sessionId: parseSessionId('stub-session'),
  };
  private daemonStatusValue: DaemonStatus = { reachable: true, reason: null };
  private usageValue: UsageReport = { usesApiPool: false, raw: 'subscription pool' };
  private scheduledAgentStatuses: ScheduledAgentStatus[] = [];
  private sessionUsageResult: SessionUsageSnapshot | null = null;
  private readonly sessionUsageBySession = new Map<string, SessionUsageSnapshot | null>();
  private readonly sessionUsageErrors = new Map<string, unknown>();
  private stopResult: CleanupResult = { success: true, warning: null };
  private removeResult: CleanupResult = { success: true, warning: null };
  private dispatchError: unknown = null;
  private stopError: unknown = null;
  private removeError: unknown = null;

  setDispatchResult(result: DispatchResult): void {
    this.dispatchResult = result;
  }

  setDaemonStatus(status: DaemonStatus): void {
    this.daemonStatusValue = status;
  }

  setUsage(report: UsageReport): void {
    this.usageValue = report;
  }

  setSessionUsage(value: SessionUsageSnapshot | null): void {
    this.sessionUsageResult = value;
  }

  setStopResult(result: CleanupResult): void {
    this.stopResult = result;
  }

  setRemoveResult(result: CleanupResult): void {
    this.removeResult = result;
  }

  setDispatchError(error: unknown): void {
    this.dispatchError = error;
  }

  setStopError(error: unknown): void {
    this.stopError = error;
  }

  setRemoveError(error: unknown): void {
    this.removeError = error;
  }

  scheduleAgentCompletion(
    sessionIdValue: string,
    status: AgentStatusValue,
    afterPollCount: number,
  ): void {
    this.scheduledAgentStatuses.push({
      sessionId: parseSessionId(sessionIdValue),
      status,
      afterPollCount,
    });
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    this.dispatchCalls.push(input);
    if (this.dispatchError !== null) {
      throw this.dispatchError;
    }
    return this.dispatchResult;
  }

  async stop(sessionId: SessionId): Promise<CleanupResult> {
    this.stopCalls.push(sessionId);
    this.callOrder.push(`stop ${sessionId}`);
    if (this.stopError !== null) {
      throw this.stopError;
    }
    return this.stopResult;
  }

  async remove(sessionId: SessionId): Promise<CleanupResult> {
    this.removeCalls.push(sessionId);
    this.callOrder.push(`remove ${sessionId}`);
    if (this.removeError !== null) {
      throw this.removeError;
    }
    return this.removeResult;
  }

  async listAgents(): Promise<AgentStatusEntry[]> {
    this.listAgentsCallCount += 1;
    return this.scheduledAgentStatuses
      .filter((entry) => entry.afterPollCount <= this.listAgentsCallCount)
      .map((entry) => ({ sessionId: entry.sessionId, status: entry.status }));
  }

  async daemonStatus(): Promise<DaemonStatus> {
    return this.daemonStatusValue;
  }

  async usage(): Promise<UsageReport> {
    return this.usageValue;
  }

  setSessionUsageFor(sessionIdValue: string, value: SessionUsageSnapshot | null): void {
    this.sessionUsageBySession.set(sessionIdValue, value);
  }

  setSessionUsageError(sessionIdValue: string, error: unknown): void {
    this.sessionUsageErrors.set(sessionIdValue, error);
  }

  async getSessionUsage(sessionId: SessionId, cwd: string): Promise<SessionUsageSnapshot | null> {
    this.getSessionUsageCalls.push({ sessionId, cwd });
    this.callOrder.push(`measure ${sessionId}`);
    if (this.sessionUsageErrors.has(sessionId)) throw this.sessionUsageErrors.get(sessionId);
    const perSession = this.sessionUsageBySession.get(sessionId);
    return perSession === undefined ? this.sessionUsageResult : perSession;
  }
}
