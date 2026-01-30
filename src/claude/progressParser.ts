/**
 * Parser for progress markers emitted by Claude during review
 *
 * Expected markers in stdout:
 * - [PROGRESS:agent-name:started]
 * - [PROGRESS:agent-name:completed]
 * - [PROGRESS:agent-name:failed:error message]
 * - [PHASE:phase-name]
 */

import type {
  AgentStatus,
  ReviewPhase,
  ReviewProgress,
  ProgressEvent,
  ProgressEventType,
} from '../types/progress.js';
import { createInitialProgress, calculateOverallProgress } from '../types/progress.js';

// Regex patterns for parsing markers
const PROGRESS_PATTERN = /\[PROGRESS:([a-z-]+):(started|completed|failed)(?::([^\]]+))?\]/gi;
const PHASE_PATTERN = /\[PHASE:(initializing|agents-running|synthesizing|publishing|completed)\]/gi;

export interface ParseResult {
  events: ProgressEvent[];
  updatedProgress: ReviewProgress;
}

export type ProgressCallback = (event: ProgressEvent, progress: ReviewProgress) => void;

/**
 * Progress parser that tracks state and emits events
 */
export class ProgressParser {
  private progress: ReviewProgress;
  private jobId: string;
  private callback?: ProgressCallback;

  constructor(jobId: string, callback?: ProgressCallback) {
    this.jobId = jobId;
    this.progress = createInitialProgress();
    this.callback = callback;
  }

  /**
   * Get current progress state
   */
  getProgress(): ReviewProgress {
    return { ...this.progress };
  }

  /**
   * Parse a chunk of stdout and update progress
   */
  parseChunk(chunk: string): ProgressEvent[] {
    const events: ProgressEvent[] = [];

    // Parse progress markers
    let match: RegExpExecArray | null;

    // Reset lastIndex for each new chunk
    PROGRESS_PATTERN.lastIndex = 0;
    while ((match = PROGRESS_PATTERN.exec(chunk)) !== null) {
      const agentName = match[1];
      const statusStr = match[2].toLowerCase();
      const errorMsg = match[3];

      const event = this.handleAgentProgress(agentName, statusStr, errorMsg);
      if (event) {
        events.push(event);
        this.callback?.(event, this.getProgress());
      }
    }

    // Parse phase markers
    PHASE_PATTERN.lastIndex = 0;
    while ((match = PHASE_PATTERN.exec(chunk)) !== null) {
      const phaseName = match[1] as ReviewPhase;

      const event = this.handlePhaseChange(phaseName);
      if (event) {
        events.push(event);
        this.callback?.(event, this.getProgress());
      }
    }

    return events;
  }

  /**
   * Handle agent progress update
   */
  private handleAgentProgress(
    agentName: string,
    statusStr: string,
    errorMsg?: string
  ): ProgressEvent | null {
    const agent = this.progress.agents.find(a => a.name === agentName);
    if (!agent) {
      // Unknown agent - might be a custom skill agent, add it dynamically
      this.progress.agents.push({
        name: agentName,
        displayName: this.formatAgentName(agentName),
        status: 'pending',
      });
      return this.handleAgentProgress(agentName, statusStr, errorMsg);
    }

    let eventType: ProgressEventType;
    let newStatus: AgentStatus;

    switch (statusStr) {
      case 'started':
        eventType = 'agent:started';
        newStatus = 'running';
        agent.startedAt = new Date();
        break;
      case 'completed':
        eventType = 'agent:completed';
        newStatus = 'completed';
        agent.completedAt = new Date();
        break;
      case 'failed':
        eventType = 'agent:failed';
        newStatus = 'failed';
        agent.completedAt = new Date();
        agent.error = errorMsg;
        break;
      default:
        return null;
    }

    agent.status = newStatus;
    this.progress.lastUpdate = new Date();
    this.progress.overallProgress = calculateOverallProgress(this.progress);

    return {
      type: eventType,
      jobId: this.jobId,
      timestamp: new Date(),
      data: {
        agentName,
        error: errorMsg,
      },
    };
  }

  /**
   * Handle phase change
   */
  private handlePhaseChange(phase: ReviewPhase): ProgressEvent | null {
    if (this.progress.currentPhase === phase) {
      return null; // No change
    }

    this.progress.currentPhase = phase;
    this.progress.lastUpdate = new Date();
    this.progress.overallProgress = calculateOverallProgress(this.progress);

    return {
      type: 'phase:changed',
      jobId: this.jobId,
      timestamp: new Date(),
      data: {
        phase,
      },
    };
  }

  /**
   * Format agent name for display (kebab-case to Title Case)
   */
  private formatAgentName(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Mark all remaining pending agents as completed (for fallback)
   */
  markAllCompleted(): void {
    for (const agent of this.progress.agents) {
      if (agent.status === 'pending' || agent.status === 'running') {
        agent.status = 'completed';
        agent.completedAt = new Date();
      }
    }
    this.progress.currentPhase = 'completed';
    this.progress.overallProgress = 100;
    this.progress.lastUpdate = new Date();
  }

  /**
   * Mark review as failed
   */
  markFailed(error: string): void {
    for (const agent of this.progress.agents) {
      if (agent.status === 'running') {
        agent.status = 'failed';
        agent.completedAt = new Date();
        agent.error = error;
      }
    }
    this.progress.lastUpdate = new Date();
    this.progress.overallProgress = calculateOverallProgress(this.progress);
  }
}

/**
 * Parse a single chunk without state (utility function)
 */
export function parseProgressMarkers(chunk: string): {
  agents: Array<{ name: string; status: string; error?: string }>;
  phases: string[];
} {
  const agents: Array<{ name: string; status: string; error?: string }> = [];
  const phases: string[] = [];

  let match: RegExpExecArray | null;

  PROGRESS_PATTERN.lastIndex = 0;
  while ((match = PROGRESS_PATTERN.exec(chunk)) !== null) {
    agents.push({
      name: match[1],
      status: match[2].toLowerCase(),
      error: match[3],
    });
  }

  PHASE_PATTERN.lastIndex = 0;
  while ((match = PHASE_PATTERN.exec(chunk)) !== null) {
    phases.push(match[1]);
  }

  return { agents, phases };
}
