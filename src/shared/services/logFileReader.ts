import { readFileSync, existsSync, statSync } from 'node:fs';

export function logFileExists(logPath: string): boolean {
  return existsSync(logPath);
}

export function readLastLines(logPath: string, count: number): string[] {
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-count);
}

export function watchLogFile(
  logPath: string,
  onLine: (line: string) => void,
): { stop: () => void } {
  let lastSize = existsSync(logPath) ? statSync(logPath).size : 0;

  const interval = setInterval(() => {
    if (!existsSync(logPath)) return;

    const currentSize = statSync(logPath).size;
    if (currentSize <= lastSize) {
      lastSize = currentSize;
      return;
    }

    const content = readFileSync(logPath, 'utf-8');
    const allBytes = Buffer.byteLength(content, 'utf-8');
    const newContent = content.slice(content.length - (allBytes - lastSize));
    lastSize = currentSize;

    const newLines = newContent.split('\n').filter((line) => line.trim().length > 0);
    for (const line of newLines) {
      onLine(line);
    }
  }, 500);

  return {
    stop: () => clearInterval(interval),
  };
}
