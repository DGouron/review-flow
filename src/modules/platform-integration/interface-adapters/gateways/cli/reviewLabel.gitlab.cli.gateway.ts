import type {
  EnsureReviewLabelInput,
  ReviewLabelGateway,
  ReviewLabelInput,
} from '@/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

// Single-quote for the shell: the executor runs this string through /bin/sh, where
// the colour's leading `#` and a label name are not safe to leave bare.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const LABEL_COLOR = '#1f77b4';

function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '%2F');
}

export class GitLabReviewLabelCliGateway implements ReviewLabelGateway {
  constructor(private readonly executor: CommandExecutor) {}

  /**
   * GitLab answers 409 when the label already exists, which makes the CLI exit
   * non-zero. Swallowed here so the caller can still apply an existing label.
   */
  async ensureLabelExists(input: EnsureReviewLabelInput): Promise<void> {
    const endpoint = `projects/${encodeProjectPath(input.projectPath)}/labels`;
    const command = `glab api --method POST ${shellQuote(endpoint)} --field ${shellQuote(`name=${input.label}`)} --field ${shellQuote(`color=${LABEL_COLOR}`)}`;
    try {
      this.executor(command);
    } catch {
      // Non-throwing by contract: a genuine failure surfaces as an addLabel failure.
    }
  }

  async addLabel(input: ReviewLabelInput): Promise<void> {
    this.executor(this.buildUpdateCommand(input, `add_labels=${input.label}`));
  }

  async removeLabel(input: ReviewLabelInput): Promise<void> {
    this.executor(this.buildUpdateCommand(input, `remove_labels=${input.label}`));
  }

  private buildUpdateCommand(input: ReviewLabelInput, field: string): string {
    const endpoint = `projects/${encodeProjectPath(input.projectPath)}/merge_requests/${input.mrNumber}`;
    return `glab api --method PUT ${shellQuote(endpoint)} --field ${shellQuote(field)}`;
  }
}
