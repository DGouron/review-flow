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

  private dispatchResult: DispatchResult = {
    status: 'dispatched',
    sessionId: parseSessionId('stub-session'),
  };
  private daemonStatusValue: DaemonStatus = { reachable: true, reason: null };
  private usageValue: UsageReport = { usesApiPool: false, raw: 'subscription pool' };
  private scheduledAgentStatuses: ScheduledAgentStatus[] = [];
  private sessionUsageResult: SessionUsageSnapshot | null = null;
  private stopResult: CleanupResult = { success: true, warning: null };
  private removeResult: CleanupResult = { success: true, warning: null };
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
    return this.dispatchResult;
  }

  async stop(sessionId: SessionId): Promise<CleanupResult> {
    this.stopCalls.push(sessionId);
    if (this.stopError !== null) {
      throw this.stopError;
    }
    return this.stopResult;
  }

  async remove(sessionId: SessionId): Promise<CleanupResult> {
    this.removeCalls.push(sessionId);
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

  async getSessionUsage(sessionId: SessionId, cwd: string): Promise<SessionUsageSnapshot | null> {
    this.getSessionUsageCalls.push({ sessionId, cwd });
    return this.sessionUsageResult;
  }
}
