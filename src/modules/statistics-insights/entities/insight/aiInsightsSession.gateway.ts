export type AiInsightsSessionResult =
  | { status: 'completed'; answer: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'timed-out' };

export interface AiInsightsSessionGateway {
  run(prompt: string, projectPath: string): Promise<AiInsightsSessionResult>;
}
