import { z } from 'zod';

interface FollowupImportantsDependencies {
  serverPort: number;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fetch: typeof globalThis.fetch;
}

interface FollowupImportantsInput {
  project?: string;
}

const followupImportantsResponseSchema = z.object({
  triggered: z.number(),
  candidates: z.array(
    z.object({
      mrId: z.string(),
      mrNumber: z.number(),
      title: z.string(),
    }),
  ),
  failed: z.array(z.object({ mrId: z.string(), error: z.string() })),
});

export class FollowupImportantsUseCase {
  constructor(private readonly deps: FollowupImportantsDependencies) {}

  async execute(input: FollowupImportantsInput, _deps?: unknown): Promise<void> {
    const baseUrl = `http://localhost:${this.deps.serverPort}`;

    const response = await this.deps.fetch(`${baseUrl}/api/mr-tracking/followup-importants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: input.project }),
    });

    const parsed = followupImportantsResponseSchema.safeParse(await response.json());

    if (!parsed.success || parsed.data.candidates.length === 0) {
      this.deps.log('No pending-approval MRs with Important issues found.');
      return;
    }

    const data = parsed.data;
    this.deps.log(`Triggered ${data.triggered} followup(s):`);
    for (const candidate of data.candidates) {
      this.deps.log(`  - !${candidate.mrNumber}: ${candidate.title}`);
    }

    if (data.failed.length > 0) {
      this.deps.error(`${data.failed.length} failed.`);
    }
  }
}
