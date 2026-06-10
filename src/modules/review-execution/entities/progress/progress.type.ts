export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ReviewPhase =
  | 'initializing'
  | 'agents-running'
  | 'synthesizing'
  | 'publishing'
  | 'completed';

export interface AgentProgress {
  name: string;
  displayName: string;
  status: AgentStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ReviewProgress {
  agents: AgentProgress[];
  currentPhase: ReviewPhase;
  overallProgress: number;
  lastUpdate: Date;
}

export type ProgressEventType =
  | 'agent:started'
  | 'agent:completed'
  | 'agent:failed'
  | 'phase:changed';

export interface ProgressEvent {
  type: ProgressEventType;
  jobId: string;
  timestamp: Date;
  data: {
    agentName?: string;
    phase?: ReviewPhase;
    error?: string;
  };
}
