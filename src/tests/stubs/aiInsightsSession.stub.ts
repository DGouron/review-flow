import type {
  AiInsightsSessionGateway,
  AiInsightsSessionResult,
} from '@/modules/statistics-insights/entities/insight/aiInsightsSession.gateway.js';

export class StubAiInsightsSessionGateway implements AiInsightsSessionGateway {
  runCalls: string[] = [];
  projectPaths: string[] = [];

  private result: AiInsightsSessionResult = {
    status: 'completed',
    answer: '{}',
  };

  setResult(result: AiInsightsSessionResult): void {
    this.result = result;
  }

  async run(prompt: string, projectPath: string): Promise<AiInsightsSessionResult> {
    this.runCalls.push(prompt);
    this.projectPaths.push(projectPath);
    return this.result;
  }
}
