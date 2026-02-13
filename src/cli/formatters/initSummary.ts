export interface InitSummaryInput {
  configPath: string;
  envPath: string;
  port: number;
  repositoryCount: number;
  mcpStatus: 'configured' | 'already-configured' | 'claude-not-found' | 'validation-failed' | 'skipped' | 'failed';
  gitlabUsername: string;
  githubUsername: string;
}

function mcpLine(status: InitSummaryInput['mcpStatus']): string {
  switch (status) {
    case 'configured':
      return '  MCP server:    configured';
    case 'already-configured':
      return '  MCP server:    already configured';
    case 'claude-not-found':
      return '  MCP server:    skipped (Claude CLI not found)';
    case 'skipped':
      return '  MCP server:    skipped by user';
    case 'validation-failed':
      return '  MCP server:    configuration written but validation failed';
    case 'failed':
      return '  MCP server:    configuration failed';
  }
}

export function formatInitSummary(input: InitSummaryInput): string {
  const lines: string[] = [
    '',
    'ReviewFlow initialized successfully!',
    '',
    'Configuration:',
    `  Config file:   ${input.configPath}`,
    `  Env file:      ${input.envPath}`,
    `  Port:          ${input.port}`,
    `  Repositories:  ${input.repositoryCount}`,
    mcpLine(input.mcpStatus),
    '',
    'Next steps:',
    '  1. Configure webhook secrets on your GitLab/GitHub projects',
    '  2. Start the server: reviewflow start',
    '  3. Check status:     reviewflow validate',
    '',
  ];

  return lines.join('\n');
}
