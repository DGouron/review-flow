/**
 * Centralized logging service for dashboard visibility
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 200;
const logBuffer: LogEntry[] = [];
const listeners: Array<(log: LogEntry) => void> = [];

/**
 * Add a log entry
 */
export function addLog(
  level: LogEntry['level'],
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }

  // Notify all listeners
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Get all log entries
 */
export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Get logs filtered by level
 */
export function getLogsByLevel(level: LogEntry['level']): LogEntry[] {
  return logBuffer.filter(log => log.level === level);
}

/**
 * Get error logs only
 */
export function getErrorLogs(): LogEntry[] {
  return logBuffer.filter(log => log.level === 'error' || log.level === 'warn');
}

/**
 * Subscribe to new log entries
 */
export function onLog(callback: (log: LogEntry) => void): () => void {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
  logBuffer.length = 0;
}

// Convenience methods
export const logInfo = (msg: string, data?: Record<string, unknown>) => addLog('info', msg, data);
export const logWarn = (msg: string, data?: Record<string, unknown>) => addLog('warn', msg, data);
export const logError = (msg: string, data?: Record<string, unknown>) => addLog('error', msg, data);
export const logDebug = (msg: string, data?: Record<string, unknown>) => addLog('debug', msg, data);
