interface FollowupImportantsDependencies {
  serverPort: number;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fetch: typeof globalThis.fetch;
}

interface FollowupImportantsInput {
  project?: string;
}

interface FollowupImportantsCandidate {
  mrId: string;
  mrNumber: number;
  title: string;
}

interface FollowupImportantsResponse {
  success: boolean;
  triggered: number;
  candidates: FollowupImportantsCandidate[];
  failed: Array<{ mrId: string; error: string }>;
}

export class FollowupImportantsUseCase {
  constructor(private readonly deps: FollowupImportantsDependencies) {}

  async execute(input: FollowupImportantsInput, _deps?: unknown): Promise<void> {
    const baseUrl = `http://localhost:${this.deps.serverPort}`;

    const response = await this.deps.fetch(`${baseUrl}/api/mr-tracking/followup-importants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: input.project }),
    });

    const data = (await response.json()) as FollowupImportantsResponse;

    if (!data.candidates || data.candidates.length === 0) {
      this.deps.log('No pending-approval MRs with Important issues found.');
      return;
    }

    this.deps.log(`Triggered ${data.triggered} followup(s):`);
    for (const candidate of data.candidates) {
      this.deps.log(`  - !${candidate.mrNumber}: ${candidate.title}`);
    }

    if (data.failed && data.failed.length > 0) {
      this.deps.error(`${data.failed.length} failed.`);
    }
  }
}
