export type SimpleCommandExecutor = (command: string) => string;

/**
 * Executor for commands whose arguments carry attacker-influenceable values (project paths,
 * merge request payloads). The command name and each argument stay separate, so the spawn
 * happens without a shell and no value can escape a quoting context.
 */
export type ArgvCommandExecutor = (command: string, args: string[]) => string;
