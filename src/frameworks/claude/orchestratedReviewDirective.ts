import { join } from 'node:path';

/** One Bash call of the clerk stops at ten minutes: the await returns before. */
export const AWAIT_MAX_WAIT_SECONDS = 540;

export type OrchestratedReviewDirectiveInput = {
  jobId: string;
  clerkSessionName: string;
  /** The running ReviewFlow CLI, as absolute paths ready for a shell. */
  cliCommand: string;
  reviewTimeoutMinutes: number;
  roleTimeoutMinutes: number;
};

export type CliLocation = {
  moduleDirectory: string;
  workingDirectory: string;
  fileExists: (path: string) => boolean;
};

function shellQuoted(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

export function shellCommandOf(words: string[]): string {
  return words.map(shellQuoted).join(' ');
}

/**
 * The CLI of the running build, never `reviewflow` from the PATH a background session may lack.
 * @throws Error when no build holds the CLI
 */
export function resolveReviewflowCliPath(location: CliLocation): string {
  const besideBuild = join(location.moduleDirectory, '..', '..', 'main', 'cli.js');
  if (location.fileExists(besideBuild)) return besideBuild;
  const workingDirectoryBuild = join(location.workingDirectory, 'dist', 'main', 'cli.js');
  if (location.fileExists(workingDirectoryBuild)) return workingDirectoryBuild;
  throw new Error(
    `ReviewFlow CLI not found at: ${besideBuild} or ${workingDirectoryBuild}\n` +
      'Run "yarn build" to compile the project.',
  );
}

export function buildOrchestratedReviewDirective(input: OrchestratedReviewDirectiveInput): string {
  const launchCommand = `${input.cliCommand} session launch --job ${input.jobId}`;
  const awaitCommand = `${input.cliCommand} session await --job ${input.jobId} --max-wait ${AWAIT_MAX_WAIT_SECONDS}`;
  return `## ORCHESTRATED REVIEW — YOU ARE THE CLERK (DAVE)

This review runs in orchestrated mode: the skill was called with the argument \`orchestre\`.
Use these four values exactly as written: \`reviewflow\` may not be on this session's PATH.

- **Job ID**: \`${input.jobId}\`
- **Your session name**: \`${input.clerkSessionName}\` — write it exactly in each lot's brief: the lots send their findings to this name with SendMessage.
- **Launch command**: \`${launchCommand}\` — add \`--role lot:<id> --brief <absolute path of the brief>\`. It prints \`LAUNCHED <session id> <name>\` or \`ERROR <reason>\`.
- **Await command**: \`${awaitCommand}\` — each line reads \`DONE|FAILED|TIMEOUT <role> <session id>\`; a role session still running prints no line. Run it again while a lot has neither answered nor missed.

A lot's message reaches you as a cross-session message at your next tool call, or wakes you if your turn has ended.
A role session counts as TIMEOUT ${input.roleTimeoutMinutes} minutes after its launch. This review stops ${input.reviewTimeoutMinutes} minutes after it was dispatched.
ReviewFlow ends every role session of the job when the job ends: never end one yourself.`;
}
