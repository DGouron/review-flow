import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ReviewProgress, ProgressEvent } from '../types/progress.js';
import type { Dependencies } from './dependencies.js';
import { getJobsStatus, setProgressChangeCallback, setStateChangeCallback, updateJobProgress } from '../queue/reviewQueue.js';
import { onLog, type LogEntry } from '../services/logService.js';

const wsClients = new Set<WebSocket>();

let injectedDeps: Pick<Dependencies, 'reviewContextWatcher' | 'progressPresenter'> | null = null;

export function getWsClientsCount(): number {
  return wsClients.size;
}

function broadcastProgress(jobId: string, progress: ReviewProgress, event?: ProgressEvent): void {
  const message = JSON.stringify({
    type: 'progress',
    jobId,
    progress,
    event,
    timestamp: new Date().toISOString(),
  });

  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function broadcastLogEntry(log: LogEntry): void {
  const message = JSON.stringify({
    type: 'log',
    log,
  });

  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function broadcastStateChange(): void {
  const jobs = getJobsStatus();
  const clientCount = Array.from(wsClients).filter(c => c.readyState === 1).length;
  console.log(`[WS Broadcast] state: ${jobs.active.length} active reviews to ${clientCount} clients`);

  const message = JSON.stringify({
    type: 'state',
    activeReviews: jobs.active,
    recentReviews: jobs.recent,
    timestamp: new Date().toISOString(),
  });

  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

export function setupWebSocketCallbacks(deps: Pick<Dependencies, 'reviewContextWatcher' | 'progressPresenter'>): void {
  injectedDeps = deps;
  onLog(broadcastLogEntry);
  setProgressChangeCallback((jobId, progress, event) => {
    broadcastProgress(jobId, progress, event);
  });
  setStateChangeCallback(() => {
    broadcastStateChange();
  });
}

export function startWatchingReviewContext(jobId: string, localPath: string, mergeRequestId: string): void {
  if (!injectedDeps) {
    throw new Error('WebSocket dependencies not initialized. Call setupWebSocketCallbacks first.');
  }
  const { reviewContextWatcher, progressPresenter } = injectedDeps;
  reviewContextWatcher.start(localPath, mergeRequestId, (contextProgress) => {
    const reviewProgress = progressPresenter.toReviewProgress(contextProgress);
    updateJobProgress(jobId, reviewProgress);
  });
}

export function stopWatchingReviewContext(mergeRequestId: string): void {
  if (!injectedDeps) {
    throw new Error('WebSocket dependencies not initialized. Call setupWebSocketCallbacks first.');
  }
  injectedDeps.reviewContextWatcher.stop(mergeRequestId);
}

export async function registerWebSocketRoutes(
  app: FastifyInstance,
  deps: Pick<Dependencies, 'logger'>
): Promise<void> {
  const { logger } = deps;
  app.get('/ws', { websocket: true }, (connection) => {
    const socket = connection.socket;
    logger.info('WebSocket client connected');
    wsClients.add(socket);

    const jobs = getJobsStatus();
    logger.info({ activeCount: jobs.active.length, recentCount: jobs.recent.length }, 'Sending init to new WebSocket client');
    socket.send(JSON.stringify({
      type: 'init',
      activeReviews: jobs.active,
      recentReviews: jobs.recent,
      timestamp: new Date().toISOString(),
    }));

    socket.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    socket.on('close', () => {
      logger.info('WebSocket client disconnected');
      wsClients.delete(socket);
    });

    socket.on('error', (error: Error) => {
      logger.warn({ error }, 'WebSocket error');
      wsClients.delete(socket);
    });
  });
}
