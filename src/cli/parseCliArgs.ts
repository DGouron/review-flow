export interface CliArgs {
  command: 'start' | 'version' | 'help';
  skipDependencyCheck: boolean;
}

export function parseCliArgs(args: string[]): CliArgs {
  if (args.includes('--version') || args.includes('-v')) {
    return { command: 'version', skipDependencyCheck: false };
  }

  if (args.includes('--help') || args.includes('-h')) {
    return { command: 'help', skipDependencyCheck: false };
  }

  return {
    command: 'start',
    skipDependencyCheck: args.includes('--skip-dependency-check'),
  };
}
