interface StartArgs {
  command: 'start';
  skipDependencyCheck: boolean;
  daemon: boolean;
  port: number | undefined;
  open: boolean;
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

interface InitArgs {
  command: 'init';
  yes: boolean;
  skipMcp: boolean;
  showSecrets: boolean;
  scanPaths: string[];
}

interface ValidateArgs {
  command: 'validate';
  fix: boolean;
}

interface VersionArgs {
  command: 'version';
}

interface HelpArgs {
  command: 'help';
}

export type CliArgs = StartArgs | StopArgs | StatusArgs | LogsArgs | InitArgs | ValidateArgs | VersionArgs | HelpArgs;

const KNOWN_COMMANDS = ['start', 'stop', 'status', 'logs', 'init', 'validate'] as const;
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
    open: hasFlag(args, '--open', '-o'),
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

function getAllFlagValues(args: string[], long: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === long && args[index + 1] !== undefined) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function parseInitArgs(args: string[]): InitArgs {
  return {
    command: 'init',
    yes: hasFlag(args, '--yes', '-y'),
    skipMcp: hasFlag(args, '--skip-mcp'),
    showSecrets: hasFlag(args, '--show-secrets'),
    scanPaths: getAllFlagValues(args, '--scan-path'),
  };
}

function parseValidateArgs(args: string[]): ValidateArgs {
  return {
    command: 'validate',
    fix: hasFlag(args, '--fix'),
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
    case 'init':
      return parseInitArgs(args);
    case 'validate':
      return parseValidateArgs(args);
  }
}
