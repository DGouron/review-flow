import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import type { ReviewProgress, ProgressEvent } from '../types/progress.js';
import { getJobsStatus, setProgressChangeCallback, setStateChangeCallback } from '../queue/reviewQueue.js';
import { onLog, type LogEntry } from '../services/logService.js';

const wsClients = new Set<WebSocket>();

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

export function setupWebSocketCallbacks(): void {
  onLog(broadcastLogEntry);
  setProgressChangeCallback((jobId, progress, event) => {
    broadcastProgress(jobId, progress, event);
  });
  setStateChangeCallback(() => {
    broadcastStateChange();
  });
}

export async function registerWebSocketRoutes(
  app: FastifyInstance,
  logger: Logger
): Promise<void> {
  app.get('/ws', { websocket: true }, (connection) => {
    const socket = connection.socket;
    logger.info('WebSocket client connected');
    wsClients.add(socket);

    const jobs = getJobsStatus();
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
