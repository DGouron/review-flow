type KillFunction = (pid: number, signal: number) => void;

export function isProcessRunning(
  pid: number,
  kill: KillFunction = process.kill,
): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
