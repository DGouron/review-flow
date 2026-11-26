/**
 * Name of the folder under `~/.claude/projects` where Claude Code writes the transcripts of a
 * session started in `cwd`: every non-alphanumeric character becomes "-".
 */
export function claudeProjectFolderOf(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}
