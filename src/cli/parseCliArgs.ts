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

interface DiscoverArgs {
  command: 'discover';
  scanPaths: string[];
  maxDepth: number;
}

interface ValidateArgs {
  command: 'validate';
  fix: boolean;
}

interface VersionArgs {
  command: 'version';
}

interface FollowupImportantsArgs {
  command: 'followup-importants';
  project: string | undefined;
  yes: boolean;
}

interface SetupArgs {
  command: 'setup';
  path: string | undefined;
  json: boolean;
  force: boolean;
  ai: boolean;
  yes: boolean;
  showSecrets: boolean;
}

interface HelpArgs {
  command: 'help';
}

export interface SessionLaunchArgs {
  command: 'session';
  action: 'launch';
  role: string | null;
  brief: string | null;
  job: string | null;
}

interface UnknownSessionArgs {
  command: 'session';
  action: null;
}

export type SessionArgs = SessionLaunchArgs | UnknownSessionArgs;

export type CliArgs =
  | StartArgs
  | StopArgs
  | StatusArgs
  | LogsArgs
  | InitArgs
  | DiscoverArgs
  | ValidateArgs
  | FollowupImportantsArgs
  | SetupArgs
  | SessionArgs
  | VersionArgs
  | HelpArgs;

const KNOWN_COMMANDS = [
  'start',
  'stop',
  'status',
  'logs',
  'init',
  'discover',
  'validate',
  'followup-importants',
  'setup',
  'session',
] as const;
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

function isKnownCommand(value: string): value is KnownCommand {
  return KNOWN_COMMANDS.some((command) => command === value);
}

function extractCommand(args: string[]): KnownCommand {
  const positional = args.find((arg) => !arg.startsWith('-'));
  if (positional !== undefined && isKnownCommand(positional)) {
    return positional;
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

function parseFollowupImportantsArgs(args: string[]): FollowupImportantsArgs {
  return {
    command: 'followup-importants',
    project: getFlagValue(args, '--project', '-p'),
    yes: hasFlag(args, '--yes', '-y'),
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

function parseDiscoverArgs(args: string[]): DiscoverArgs {
  const maxDepthValue = getFlagValue(args, '--max-depth');
  return {
    command: 'discover',
    scanPaths: getAllFlagValues(args, '--scan-path'),
    maxDepth: maxDepthValue !== undefined ? Number(maxDepthValue) : 3,
  };
}

function parseValidateArgs(args: string[]): ValidateArgs {
  return {
    command: 'validate',
    fix: hasFlag(args, '--fix'),
  };
}

function isPositionalPath(arg: string, index: number, args: string[]): boolean {
  if (arg.startsWith('-')) return false;
  if (arg === 'setup') return false;
  return index === 0 || args[index - 1] !== '--path';
}

function parseSetupArgs(args: string[]): SetupArgs {
  const positional = args.find((arg, index) => isPositionalPath(arg, index, args));
  const flagPath = getFlagValue(args, '--path');
  return {
    command: 'setup',
    path: flagPath ?? positional,
    json: hasFlag(args, '--json'),
    force: hasFlag(args, '--force'),
    ai: hasFlag(args, '--ai'),
    yes: hasFlag(args, '--yes', '-y'),
    showSecrets: hasFlag(args, '--show-secrets'),
  };
}

function parseSessionArgs(args: string[]): SessionArgs {
  const action = args[args.indexOf('session') + 1];
  if (action !== 'launch') {
    return { command: 'session', action: null };
  }
  return {
    command: 'session',
    action,
    role: getFlagValue(args, '--role') ?? null,
    brief: getFlagValue(args, '--brief') ?? null,
    job: getFlagValue(args, '--job') ?? null,
  };
}

const COMMAND_PARSERS: Record<KnownCommand, (args: string[]) => CliArgs> = {
  start: parseStartArgs,
  stop: parseStopArgs,
  status: parseStatusArgs,
  logs: parseLogsArgs,
  init: parseInitArgs,
  discover: parseDiscoverArgs,
  validate: parseValidateArgs,
  'followup-importants': parseFollowupImportantsArgs,
  setup: parseSetupArgs,
  session: parseSessionArgs,
};

export function parseCliArgs(args: string[]): CliArgs {
  if (hasFlag(args, '--version', '-v')) {
    return { command: 'version' };
  }

  if (hasFlag(args, '--help', '-h')) {
    return { command: 'help' };
  }

  return COMMAND_PARSERS[extractCommand(args)](args);
}
