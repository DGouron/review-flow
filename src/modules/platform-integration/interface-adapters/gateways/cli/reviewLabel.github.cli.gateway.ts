import type {
  EnsureReviewLabelInput,
  ReviewLabelGateway,
  ReviewLabelInput,
} from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

// Single-quote for the shell: the executor runs this string through /bin/sh, where
// `labels[]=` would otherwise be read as a glob character class.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export class GitHubReviewLabelCliGateway implements ReviewLabelGateway {
  constructor(private readonly executor: CommandExecutor) {}

  /** `--force` updates the label instead of failing when it already exists. */
  async ensureLabelExists(input: EnsureReviewLabelInput): Promise<void> {
    const command = `gh label create ${shellQuote(input.label)} --force -R ${shellQuote(input.projectPath)}`;
    try {
      this.executor(command);
    } catch {
      // Non-throwing by contract: a genuine failure surfaces as an addLabel failure.
    }
  }

  async addLabel(input: ReviewLabelInput): Promise<void> {
    const endpoint = `repos/${input.projectPath}/issues/${input.mrNumber}/labels`;
    const command = `gh api --method POST ${shellQuote(endpoint)} --field ${shellQuote(`labels[]=${input.label}`)}`;
    this.executor(command);
  }

  async removeLabel(input: ReviewLabelInput): Promise<void> {
    const endpoint = `repos/${input.projectPath}/issues/${input.mrNumber}/labels/${input.label}`;
    const command = `gh api --method DELETE ${shellQuote(endpoint)}`;
    this.executor(command);
  }
}
