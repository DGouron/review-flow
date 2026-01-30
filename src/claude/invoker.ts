import { spawn } from 'node:child_process';
import type { Logger } from 'pino';
import type { ReviewJob } from '../queue/reviewQueue.js';

export interface InvocationResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Invoke Claude Code CLI for a review job
 */
export async function invokeClaudeReview(
  job: ReviewJob,
  logger: Logger
): Promise<InvocationResult> {
  const startTime = Date.now();

  // Build the prompt
  const prompt = `/${job.skill} ${job.mrNumber}`;

  // Build arguments
  const args = [
    '--print',
    '--permission-mode', 'dontAsk',
    '--model', 'sonnet',
    '-p', prompt,
  ];

  logger.info(
    {
      cwd: job.localPath,
      prompt,
      args,
    },
    'Invocation Claude CLI'
  );

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('claude', args, {
      cwd: job.localPath,
      env: {
        ...process.env,
        // Ensure non-interactive mode
        TERM: 'dumb',
        CI: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      // Log progress in real-time (truncated)
      const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk;
      logger.debug({ preview }, 'Claude stdout');
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      logger.warn({ chunk }, 'Claude stderr');
    });

    child.on('error', (error) => {
      logger.error({ error }, 'Erreur lors du spawn de Claude');
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\nSpawn error: ${error.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const success = code === 0;

      logger.info(
        {
          exitCode: code,
          durationMs,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
        },
        success ? 'Claude terminé avec succès' : 'Claude terminé avec erreur'
      );

      resolve({
        success,
        exitCode: code,
        stdout,
        stderr,
        durationMs,
      });
    });
  });
}

/**
 * Send desktop notification
 */
export function sendNotification(
  title: string,
  message: string,
  logger: Logger
): void {
  try {
    // Use notify-send on Linux
    const child = spawn('notify-send', [
      '--app-name=Claude Review',
      '--urgency=normal',
      '--icon=dialog-information',
      title,
      message,
    ]);

    child.on('error', (error) => {
      logger.warn({ error }, 'Notification desktop non disponible');
    });
  } catch {
    logger.warn('notify-send non disponible');
  }
}
