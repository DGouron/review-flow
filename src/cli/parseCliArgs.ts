interface StartArgs {
  command: 'start';
  skipDependencyCheck: boolean;
  daemon: boolean;
  port: number | undefined;
}

interface StopArgs {
  command: 'stop';
  force: boolean;
}

interface StatusArgs {
  command: 'status';
  json: boolean;
}

interface LogsArgs {
  command: 'logs';
  follow: boolean;
  lines: number;
}

interface VersionArgs {
  command: 'version';
}

interface HelpArgs {
  command: 'help';
}

export type CliArgs = StartArgs | StopArgs | StatusArgs | LogsArgs | VersionArgs | HelpArgs;

const KNOWN_COMMANDS = ['start', 'stop', 'status', 'logs'] as const;
type KnownCommand = (typeof KNOWN_COMMANDS)[number];

function hasFlag(args: string[], long: string, short?: string): boolean {
  return args.includes(long) || (short !== undefined && args.includes(short));
}

function getFlagValue(args: string[], long: string, short?: string): string | undefined {
  for (let index = 0; index < args.length; index++) {
    if (args[index] === long || (short !== undefined && args[index] === short)) {
      return args[index + 1];
    }
  }
  return undefined;
}

function extractCommand(args: string[]): KnownCommand {
  const positional = args.find((arg) => !arg.startsWith('-'));
  if (positional && (KNOWN_COMMANDS as readonly string[]).includes(positional)) {
    return positional as KnownCommand;
  }
  return 'start';
}

function parseStartArgs(args: string[]): StartArgs {
  const portValue = getFlagValue(args, '--port', '-p');
  return {
    command: 'start',
    skipDependencyCheck: hasFlag(args, '--skip-dependency-check'),
    daemon: hasFlag(args, '--daemon', '-d'),
    port: portValue !== undefined ? Number(portValue) : undefined,
  };
}

function parseStopArgs(args: string[]): StopArgs {
  return {
    command: 'stop',
    force: hasFlag(args, '--force', '-f'),
  };
}

function parseStatusArgs(args: string[]): StatusArgs {
  return {
    command: 'status',
    json: hasFlag(args, '--json'),
  };
}

function parseLogsArgs(args: string[]): LogsArgs {
  const linesValue = getFlagValue(args, '--lines', '-n');
  return {
    command: 'logs',
    follow: hasFlag(args, '--follow', '-f'),
    lines: linesValue !== undefined ? Number(linesValue) : 20,
  };
}

export function parseCliArgs(args: string[]): CliArgs {
  if (hasFlag(args, '--version', '-v')) {
    return { command: 'version' };
  }

  if (hasFlag(args, '--help', '-h')) {
    return { command: 'help' };
  }

  const command = extractCommand(args);

  switch (command) {
    case 'start':
      return parseStartArgs(args);
    case 'stop':
      return parseStopArgs(args);
    case 'status':
      return parseStatusArgs(args);
    case 'logs':
      return parseLogsArgs(args);
  }
}
