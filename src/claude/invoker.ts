import { spawn } from 'node:child_process';
import type { Logger } from 'pino';
import type { ReviewJob } from '../queue/reviewQueue.js';
import type { ReviewProgress, ProgressEvent } from '../types/progress.js';
import { ProgressParser } from './progressParser.js';
import { logInfo, logWarn, logError } from '../services/logService.js';
import { getModel } from '../services/runtimeSettings.js';

export interface InvocationResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  finalProgress?: ReviewProgress;
}

export type ProgressCallback = (progress: ReviewProgress, event?: ProgressEvent) => void;

/**
 * Invoke Claude Code CLI for a review job
 */
export async function invokeClaudeReview(
  job: ReviewJob,
  logger: Logger,
  onProgress?: ProgressCallback
): Promise<InvocationResult> {
  const startTime = Date.now();

  // Build the prompt
  const prompt = `/${job.skill} ${job.mrNumber}`;

  // Get configured model
  const model = getModel();

  // Build arguments
  // Allow git and glab commands for review workflow
  const args = [
    '--print',
    '--dangerously-skip-permissions',
    '--model', model,
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

  // Log to dashboard
  logInfo('Démarrage review Claude', {
    jobId: job.id,
    mrNumber: job.mrNumber,
    skill: job.skill,
    project: job.projectPath,
    model,
  });

  // Initialize progress parser
  const progressParser = new ProgressParser(job.id, (event, progress) => {
    logger.debug({ event, progress: progress.overallProgress }, 'Progress update');
    onProgress?.(progress, event);
  });

  // Emit initial progress
  onProgress?.(progressParser.getProgress());

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

      // Parse progress markers from chunk
      progressParser.parseChunk(chunk);

      // Log progress in real-time (truncated)
      const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk;
      logger.debug({ preview }, 'Claude stdout');
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      logger.warn({ chunk }, 'Claude stderr');
      logWarn('Claude stderr', { jobId: job.id, message: chunk.substring(0, 500) });
    });

    child.on('error', (error) => {
      logger.error({ error }, 'Erreur lors du spawn de Claude');
      logError('Erreur spawn Claude', { jobId: job.id, error: error.message });
      progressParser.markFailed(error.message);
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\nSpawn error: ${error.message}`,
        durationMs: Date.now() - startTime,
        finalProgress: progressParser.getProgress(),
      });
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const success = code === 0;

      // Finalize progress
      if (success) {
        progressParser.markAllCompleted();
      } else {
        progressParser.markFailed(`Exit code: ${code}`);
      }

      const finalProgress = progressParser.getProgress();
      onProgress?.(finalProgress);

      logger.info(
        {
          exitCode: code,
          durationMs,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          finalProgress: finalProgress.overallProgress,
        },
        success ? 'Claude terminé avec succès' : 'Claude terminé avec erreur'
      );

      // Log to dashboard with summary
      const durationMin = Math.round(durationMs / 60000);
      if (success) {
        logInfo('Review terminée', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          duration: `${durationMin} min`,
          outputLength: stdout.length,
        });
        // Log stdout preview for debugging
        if (stdout.length > 0) {
          logInfo('Claude output preview', {
            jobId: job.id,
            preview: stdout.substring(0, 1000),
            fullLength: stdout.length,
          });
        }
      } else {
        logError('Review échouée', {
          jobId: job.id,
          mrNumber: job.mrNumber,
          exitCode: code,
          duration: `${durationMin} min`,
          stderr: stderr.substring(0, 500),
          stdoutPreview: stdout.substring(0, 300),
        });
      }

      resolve({
        success,
        exitCode: code,
        stdout,
        stderr,
        durationMs,
        finalProgress,
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
